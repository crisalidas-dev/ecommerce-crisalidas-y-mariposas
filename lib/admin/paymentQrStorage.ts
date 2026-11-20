import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { getPaymentInfo, updatePaymentQrUrl } from "@/lib/data/payment-info";
import { PAYMENT_QR_CACHE_CONTROL, resolveQrTarget, type QrContentType } from "@/lib/domain/paymentQr";

export type PaymentQrInfo = {
  publicUrl: string;
  /** `null` when the object does not exist (or storage could not be read). */
  file: { size: number; updatedAt: string | null } | null;
};

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("Falta SUPABASE_URL en el entorno del servidor.");
  return url;
}

function splitPath(path: string): { folder: string; name: string } {
  const at = path.lastIndexOf("/");
  return at === -1 ? { folder: "", name: path } : { folder: path.slice(0, at), name: path.slice(at + 1) };
}

export async function getPaymentQrInfo(qrUrl: string | null): Promise<PaymentQrInfo> {
  const target = resolveQrTarget(qrUrl, supabaseUrl());
  const storage = createAdminClient().storage.from(target.bucket);
  const publicUrl = storage.getPublicUrl(target.path).data.publicUrl;
  const { folder, name } = splitPath(target.path);
  const { data, error } = await storage.list(folder, { search: name, limit: 10 });
  if (error) {
    console.error("getPaymentQrInfo: no se pudo leer el QR", error.message);
    return { publicUrl, file: null };
  }
  const item = data?.find((o) => o.name === name);
  if (!item) return { publicUrl, file: null };
  const size = Number((item.metadata as { size?: number } | null)?.size ?? 0);
  return { publicUrl, file: { size, updatedAt: item.updated_at ?? item.created_at ?? null } };
}

/**
 * Overwrites the object in place (atomic): on failure the old image stays. The
 * path is kept even when the new image has another format (PNG over
 * `llave.jpeg`): Storage serves the stored `contentType`, not the extension, and
 * a stable URL is what the WhatsApp agent already holds. Afterwards `qr_url` is
 * pointed at the stored object, which only changes the row when it was missing
 * or foreign (fallback path).
 */
export async function replacePaymentQr(
  bytes: Uint8Array,
  contentType: QrContentType,
): Promise<{ ok: true } | { ok: false; error: string; replaced?: boolean }> {
  const info = await getPaymentInfo();
  if (!info) return { ok: false, error: "no se encontró la fila de datos de pago" };

  const target = resolveQrTarget(info.qr_url, supabaseUrl());
  const storage = createAdminClient().storage.from(target.bucket);
  const { error } = await storage.upload(target.path, bytes, {
    upsert: true,
    contentType,
    cacheControl: PAYMENT_QR_CACHE_CONTROL,
  });
  if (error) return { ok: false, error: error.message };

  const publicUrl = storage.getPublicUrl(target.path).data.publicUrl;
  if (info.qr_url !== publicUrl) {
    const dbError = await updatePaymentQrUrl(publicUrl);
    if (dbError) return { ok: false, error: dbError.message, replaced: true };
  }
  return { ok: true };
}
