import { createSlidingWindowLimiter } from "../rateLimit.ts";

export const LOGIN_IP_LIMIT = 20;
export const LOGIN_EMAIL_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60_000;

export type LoginThrottleOptions = {
  ipLimit?: number;
  emailLimit?: number;
  windowMs?: number;
  now?: () => number;
};

/**
 * Two buckets: every attempt counts against the client IP; attempts count
 * against the normalized email too but its bucket is cleared on success, so in
 * effect only failures accumulate. Blocked attempts are not counted.
 */
export function createLoginThrottle(options: LoginThrottleOptions = {}) {
  const { ipLimit = LOGIN_IP_LIMIT, emailLimit = LOGIN_EMAIL_LIMIT, windowMs = LOGIN_WINDOW_MS, now } = options;
  const ips = createSlidingWindowLimiter({ limit: ipLimit, windowMs, now });
  const emails = createSlidingWindowLimiter({ limit: emailLimit, windowMs, now });
  const normalize = (email: string) => email.trim().toLowerCase();

  return {
    attempt(ip: string, email: string): { allowed: boolean } {
      if (!ips.check(ip).allowed) return { allowed: false };
      return { allowed: emails.check(normalize(email)).allowed };
    },
    succeeded(email: string): void {
      emails.reset(normalize(email));
    },
  };
}
