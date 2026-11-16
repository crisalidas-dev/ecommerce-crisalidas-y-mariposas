import "server-only";
import { cookies } from "next/headers";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { createSlidingWindowLimiter } from "@/lib/rateLimit";
import { SESSION_COOKIE_NAME, evaluateSession, requireSessionSecret } from "./sessionPolicy";

export const SESSION_EXPIRED_ERROR = "Tu sesión expiró. Vuelve a iniciar sesión.";
export const TOO_MANY_ACTIONS_ERROR = "Demasiadas acciones seguidas. Espera un momento e inténtalo de nuevo.";

export type AdminSessionResult =
  | { ok: true; actor: string; email: string; userId: string }
  | { ok: false; error: string };

/**
 * Per authenticated user, mutations only. In memory (per instance); see the
 * Redis TODO in `lib/rateLimit.ts`.
 */
const mutationLimiter = createSlidingWindowLimiter({ limit: 120, windowMs: 60_000 });

/**
 * Verifies the Supabase session AND the app-level session cookie (idle /
 * absolute expiry, see `sessionPolicy.ts`). Does not rate limit and does not
 * write cookies: `proxy.ts` slides the activity timestamp. Use it for pages and
 * layouts; Server Actions use `requireAdminSession`.
 *
 * `getUser()` validates the JWT against Supabase Auth, unlike `getSession()`.
 */
export async function getAdminSession(): Promise<AdminSessionResult> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: SESSION_EXPIRED_ERROR };

  const cookieStore = await cookies();
  const evaluation = await evaluateSession({
    token: cookieStore.get(SESSION_COOKIE_NAME)?.value,
    secret: requireSessionSecret(),
    userId: user.id,
    now: Date.now(),
  });
  if (evaluation.status !== "ok") return { ok: false, error: SESSION_EXPIRED_ERROR };

  return { ok: true, actor: user.email ?? "panel", email: user.email ?? "", userId: user.id };
}

/**
 * First statement of every mutating Server Action under `app/admin/(protected)`.
 * Actions run with `service_role` (they skip RLS), so this is the only gate
 * between a forged POST and the database besides `proxy.ts`.
 *
 * TODO(roles): any authenticated user passes; enforce roles here when they land.
 */
export async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await getAdminSession();
  if (!session.ok) return session;
  if (!mutationLimiter.check(session.userId).allowed) return { ok: false, error: TOO_MANY_ACTIONS_ERROR };
  return session;
}
