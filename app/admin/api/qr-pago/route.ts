import { revalidatePath } from "next/cache";
import { requireSettingsEditor } from "@/lib/admin/settingsGuard";
import { SESSION_EXPIRED_ERROR, TOO_MANY_ACTIONS_ERROR } from "@/lib/admin/requireAdminSession";
import { handlePaymentQrUpload } from "@/lib/admin/paymentQrUpload";
import { replacePaymentQr } from "@/lib/admin/paymentQrStorage";

export const runtime = "nodejs";

/**
 * Replaces the payment QR image in `key_nacergroup`. Same shape as the catalog
 * Route Handler: auth first (`proxy.ts` already covers `/admin/:path*`), JSON
 * answers, no dependency on the global Server Actions body limit.
 */
export async function POST(request: Request) {
  const response = await handlePaymentQrUpload(request, {
    authorize: async () => {
      const guard = await requireSettingsEditor();
      if (guard.ok) return { ok: true };
      const status = guard.error === SESSION_EXPIRED_ERROR ? 401 : guard.error === TOO_MANY_ACTIONS_ERROR ? 429 : 403;
      return { ok: false, status, error: guard.error };
    },
    upload: replacePaymentQr,
  });
  if (response.ok) revalidatePath("/admin/configuracion");
  return response;
}
