import "server-only";
import { requireAdminSession } from "./requireAdminSession";

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
  const session = await requireAdminSession();
  if (!session.ok) return { ok: false, error: session.error };
  return { ok: true, actor: session.actor };
}
