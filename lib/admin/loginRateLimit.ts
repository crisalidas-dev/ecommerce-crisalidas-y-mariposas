import "server-only";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/rateLimit";
import { createLoginThrottle } from "./loginThrottle";

/**
 * Login throttle. The limit is by client IP (plus email) on purpose:
 * Supabase Auth's own per-IP limits see this server's IP, not the client's, so
 * they cannot tell one attacker from the whole team. In memory per instance;
 * see the Redis TODO in `lib/rateLimit.ts`.
 */
const throttle = createLoginThrottle();

export async function allowLoginAttempt(email: string): Promise<boolean> {
  const ip = clientIpFromHeaders(await headers());
  return throttle.attempt(ip, email).allowed;
}

export const loginSucceeded = (email: string) => throttle.succeeded(email);
