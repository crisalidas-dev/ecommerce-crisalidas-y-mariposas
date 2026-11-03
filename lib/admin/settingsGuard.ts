import "server-only";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

/**
 * Single access point for every write of the Configuración section.
 *
 * TODO(roles): the panel has no role model yet, so any authenticated user may
 * edit. When the role decision lands (e.g. only `admin`), enforce it HERE and
 * every action in `app/admin/(protected)/configuracion/actions.ts` inherits it.
 */
export async function requireSettingsEditor(): Promise<
  { ok: true; actor: string } | { ok: false; error: string }
> {
  const supabase = await createAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  return { ok: true, actor: user.email ?? "panel" };
}
