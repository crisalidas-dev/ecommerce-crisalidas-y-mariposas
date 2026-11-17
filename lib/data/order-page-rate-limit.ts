import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeaders, createSlidingWindowLimiter } from "@/lib/rateLimit";

/**
 * Per-IP limits of the public order page and its receipt (slice 6). The order
 * UUID is the bearer token of the link, so cheap scanning of ids must not be
 * possible. Same in-memory pattern as `checkout-rate-limit.ts` (see the Redis
 * TODO in `lib/rateLimit.ts`).
 *
 * - page: includes the automatic refresh of a pending payment (a request every
 *   3 to 30 s), so the ceiling leaves room for a few open tabs.
 * - receipt: a PDF render per call.
 */
const pageLimiter = createSlidingWindowLimiter({ limit: 40, windowMs: 60_000 });
const receiptLimiter = createSlidingWindowLimiter({ limit: 10, windowMs: 60_000 });

async function allowed(limiter: typeof pageLimiter): Promise<boolean> {
  const ip = clientIpFromHeaders(await headers());
  return limiter.check(ip).allowed;
}

export const allowOrderPageRequest = () => allowed(pageLimiter);
export const allowReceiptRequest = () => allowed(receiptLimiter);
