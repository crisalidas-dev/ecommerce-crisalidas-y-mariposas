import { revalidatePath } from "next/cache";
import { requireSettingsEditor } from "@/lib/admin/settingsGuard";
import { SESSION_EXPIRED_ERROR, TOO_MANY_ACTIONS_ERROR } from "@/lib/admin/requireAdminSession";
import { handleCatalogPdfUpload } from "@/lib/admin/catalogPdfUpload";
import { replaceCatalog } from "@/lib/admin/catalogPdfStorage";

export const runtime = "nodejs";

/**
 * Replaces `catalogo/catalogo.pdf`. A Route Handler (not a Server Action) so
 * the 40 MB file does not depend on the global 6 MB `serverActions` limit,
 * which stays untouched. `proxy.ts` already covers `/admin/:path*`; the guard
 * here is the second barrier and answers JSON instead of a redirect.
 */
export async function POST(request: Request) {
  const response = await handleCatalogPdfUpload(request, {
    authorize: async () => {
      const guard = await requireSettingsEditor();
      if (guard.ok) return { ok: true };
      const status = guard.error === SESSION_EXPIRED_ERROR ? 401 : guard.error === TOO_MANY_ACTIONS_ERROR ? 429 : 403;
      return { ok: false, status, error: guard.error };
    },
    upload: replaceCatalog,
  });
  if (response.ok) revalidatePath("/admin/configuracion");
  return response;
}
