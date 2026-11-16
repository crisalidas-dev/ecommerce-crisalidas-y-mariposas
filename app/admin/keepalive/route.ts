import { getAdminSession } from "@/lib/admin/requireAdminSession";

/**
 * Heartbeat of `IdleSessionGuard`. The request itself is what matters: it
 * passes through `proxy.ts`, which slides the idle timer. The handler only
 * answers whether the session is still valid.
 */
export async function GET() {
  const session = await getAdminSession();
  return new Response(null, { status: session.ok ? 204 : 401, headers: { "Cache-Control": "no-store" } });
}
