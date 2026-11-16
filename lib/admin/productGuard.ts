import "server-only";
import { requireAdminSession } from "./requireAdminSession";

/**
 * Single access point for the product editor writes (ficha, precio, nombre,
 * eliminar). Actions run with service_role, so the session is checked here in
 * addition to proxy.ts (same as requireSettingsEditor and imageStorage).
 *
 * TODO(roles): the panel has no role model yet (no role table in the
 * database), so any authenticated user passes. When roles land, enforce them
 * HERE: `produccion` must not edit or delete products.
 */
export async function requireProductEditor(): Promise<
  { ok: true; actor: string } | { ok: false; error: string }
> {
  const session = await requireAdminSession();
  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true, actor: session.actor };
}
