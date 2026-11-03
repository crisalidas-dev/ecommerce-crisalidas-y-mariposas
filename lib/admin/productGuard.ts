import "server-only";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

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
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  return { ok: true, actor: user.email ?? "panel" };
}
