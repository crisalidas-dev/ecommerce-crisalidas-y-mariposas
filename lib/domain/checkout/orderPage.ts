import type { PaymentState } from "./orderView.ts";

/**
 * Client-side rules of the public order page (slice 6), kept pure so they are
 * tested. The page itself only reads state the server rendered.
 */

/** Waits between automatic refreshes while the payment is not final; the last one repeats. */
const REFRESH_DELAYS_MS = [3_000, 5_000, 8_000, 12_000, 20_000, 30_000];

/** After this long the page stops polling; the manual button remains. PSE takes minutes, not hours. */
export const REFRESH_WINDOW_MS = 5 * 60_000;

/**
 * Delay before the next automatic refresh, or null when the window is over.
 * `elapsedMs` is time since the page mounted; `attempt` counts refreshes so far.
 */
export function nextRefreshDelay(elapsedMs: number, attempt: number): number | null {
  if (elapsedMs >= REFRESH_WINDOW_MS) return null;
  return REFRESH_DELAYS_MS[Math.min(Math.max(attempt, 0), REFRESH_DELAYS_MS.length - 1)];
}

/**
 * The cart and the checkout progress are cleared only when the SERVER rendered
 * this order as paid AND this browser was checking out exactly this order
 * (`attempt.orderId` in the checkout session). Someone reopening an old receipt
 * link while building a new cart must not lose that cart.
 */
export function shouldClearCheckoutState(
  paymentState: PaymentState,
  attemptOrderId: string | null,
  orderId: string,
): boolean {
  return paymentState === "paid" && attemptOrderId !== null && attemptOrderId === orderId;
}
