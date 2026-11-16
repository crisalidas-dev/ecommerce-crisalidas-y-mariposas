/**
 * App-level admin session policy (idle timeout + absolute lifetime), enforced on
 * top of the Supabase Auth session so it does not depend on the Supabase plan.
 *
 * Pure and runtime-agnostic (Web Crypto only): it runs in `proxy.ts`, Server
 * Actions and tests. The clock is injected. No `server-only` on purpose.
 *
 * The cookie holds `{ uid, iat, last }` signed with HMAC-SHA256 using
 * `ADMIN_SESSION_SECRET`. It carries no secret data; the signature only stops
 * the browser from extending its own session or reusing another user's.
 */

/** Sign out after this long without a request to the panel. */
export const IDLE_TIMEOUT_MS = 30 * 60_000;
/** Sign out this long after login no matter how active the user is. */
export const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60_000;
/** `last` is rewritten at most this often, to avoid a Set-Cookie on every request. */
export const REFRESH_INTERVAL_MS = 60_000;
/** Tolerated clock difference for timestamps that look like they are in the future. */
const FUTURE_SKEW_MS = 60_000;

export const SESSION_COOKIE_NAME = "nacer_admin_session";
export const SESSION_COOKIE_PATH = "/admin";
export const SESSION_EXPIRED_REDIRECT = "/admin/login?expirada=1";

export type SessionPayload = { uid: string; iat: number; last: number };

export type SessionEvaluation =
  | { status: "ok"; /** New payload to persist, or null when the cookie is still fresh. */ refreshed: SessionPayload | null }
  | { status: "missing" | "invalid" | "user_mismatch" | "idle_expired" | "absolute_expired" };

export function newSession(uid: string, now: number): SessionPayload {
  return { uid, iat: now, last: now };
}

/** Fail closed: a missing or weak secret must never degrade to "no check". */
export function requireSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "Falta ADMIN_SESSION_SECRET (mínimo 32 caracteres) en el entorno del servidor. " +
        "Genera uno con: openssl rand -base64 48",
    );
  }
  return secret;
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: SESSION_COOKIE_PATH,
    // Browser-side cap; the real limits are checked from the signed payload.
    maxAge: Math.floor(ABSOLUTE_LIFETIME_MS / 1000),
  };
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const bin = atob(padded);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function encodeSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Returns the payload only when the signature matches (constant-time via `verify`). */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const sigBytes = fromBase64Url(sig);
  if (!sigBytes) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    sigBytes as BufferSource,
    encoder.encode(body),
  );
  if (!valid) return null;
  const jsonBytes = fromBase64Url(body);
  if (!jsonBytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { uid, iat, last } = parsed as Record<string, unknown>;
    if (typeof uid !== "string" || !uid) return null;
    if (typeof iat !== "number" || typeof last !== "number") return null;
    if (!Number.isFinite(iat) || !Number.isFinite(last)) return null;
    return { uid, iat, last };
  } catch {
    return null;
  }
}

export async function evaluateSession(input: {
  token: string | undefined;
  secret: string;
  /** Supabase user id the request is authenticated as. */
  userId: string;
  now: number;
}): Promise<SessionEvaluation> {
  const { token, secret, userId, now } = input;
  if (!token) return { status: "missing" };
  const session = await verifySession(token, secret);
  if (!session) return { status: "invalid" };
  if (session.uid !== userId) return { status: "user_mismatch" };
  if (session.iat > now + FUTURE_SKEW_MS || session.last > now + FUTURE_SKEW_MS) return { status: "invalid" };
  if (now - session.iat >= ABSOLUTE_LIFETIME_MS) return { status: "absolute_expired" };
  if (now - session.last >= IDLE_TIMEOUT_MS) return { status: "idle_expired" };
  if (now - session.last > REFRESH_INTERVAL_MS) return { status: "ok", refreshed: { ...session, last: now } };
  return { status: "ok", refreshed: null };
}
