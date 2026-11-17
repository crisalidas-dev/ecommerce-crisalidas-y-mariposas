import "server-only";
import {
  parsePreferenceResponse,
  type CheckoutPreference,
} from "@/lib/domain/checkout/mercadoPagoPreference";
import type { CreatePreferenceOutcome } from "@/lib/domain/checkout/startPayment";

const PREFERENCES_ENDPOINT = "https://api.mercadopago.com/checkout/preferences";
const TIMEOUT_MS = 10_000;

/**
 * Mercado Pago Checkout Pro adapter. SERVER-ONLY: `MP_ACCESS_TOKEN` has no
 * `NEXT_PUBLIC_` prefix and must never reach the browser. Plain `fetch`, no SDK:
 * one POST does not justify a dependency.
 *
 * A missing token answers `not_configured` instead of throwing. The token and
 * the payload (it carries product names and amounts only, but still) are never
 * logged; only the HTTP status and Mercado Pago's error code are.
 */
export async function createMercadoPagoPreference(
  preference: CheckoutPreference,
  idempotencyKey: string,
): Promise<CreatePreferenceOutcome> {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, error: "not_configured" };

  let response: Response;
  try {
    response = await fetch(PREFERENCES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(preference),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    console.error("createMercadoPagoPreference: request failed or timed out");
    return { ok: false, error: "unavailable" };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const code =
      typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : "";
    console.error(`createMercadoPagoPreference: HTTP ${response.status}${code ? ` (${code})` : ""}`);
    return { ok: false, error: response.status >= 500 || response.status === 429 ? "unavailable" : "rejected" };
  }

  const parsed = parsePreferenceResponse(body);
  if (!parsed.ok) {
    console.error("createMercadoPagoPreference: unreadable answer");
    return { ok: false, error: "rejected" };
  }
  return { ok: true, preferenceId: parsed.preferenceId, initPoint: parsed.initPoint };
}
