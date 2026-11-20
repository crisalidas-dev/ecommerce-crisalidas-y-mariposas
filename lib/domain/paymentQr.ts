/**
 * Payment QR image (`payment_info.qr_url`), stored in the public bucket
 * `key_nacergroup`. The WhatsApp agent sends the stored public URL, so the
 * object is replaced in place (`upsert`) and the path stays stable.
 */

export const PAYMENT_QR_BUCKET = "key_nacergroup";
export const PAYMENT_QR_DEFAULT_PATH = "llave.jpeg";
/** Matches the bucket's `file_size_limit`; every message derives from it. */
export const MAX_PAYMENT_QR_MB = 5;
export const MAX_PAYMENT_QR_BYTES = MAX_PAYMENT_QR_MB * 1024 * 1024;
export const PAYMENT_QR_TOO_BIG = `El QR supera ${MAX_PAYMENT_QR_MB} MB.`;
export const PAYMENT_QR_NOT_IMAGE = "El archivo no es una imagen válida. Usa JPG, PNG o WEBP.";
/** Short CDN cache (seconds): the same URL is overwritten, so the old QR must stop being served quickly. */
export const PAYMENT_QR_CACHE_CONTROL = "60";

export type QrContentType = "image/jpeg" | "image/png" | "image/webp";

const startsWith = (head: Uint8Array, bytes: number[], offset = 0) =>
  head.length >= offset + bytes.length && bytes.every((b, i) => head[offset + i] === b);

/** Content type from the magic bytes; `null` when it is not JPEG, PNG or WebP. */
export function detectQrImage(head: Uint8Array): QrContentType | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  // "RIFF" + 4 size bytes + "WEBP"
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type QrValidation = { ok: true; contentType: QrContentType } | { ok: false; error: string };

/** `head` is the first 12 bytes. MIME type and extension come from the client and are not trusted. */
export function validatePaymentQr(file: { size: number }, head: Uint8Array): QrValidation {
  if (file.size === 0) return { ok: false, error: "Selecciona la imagen del QR." };
  if (file.size > MAX_PAYMENT_QR_BYTES) return { ok: false, error: PAYMENT_QR_TOO_BIG };
  const contentType = detectQrImage(head);
  return contentType ? { ok: true, contentType } : { ok: false, error: PAYMENT_QR_NOT_IMAGE };
}

export type QrTarget = { bucket: string; path: string };

/**
 * Bucket and object path of the stored QR. Taken from `qrUrl` only when it is a
 * public Storage URL of this project (same origin as `supabaseUrl`); anything
 * else (null, foreign host, signed URL, traversal) falls back to the default.
 */
export function resolveQrTarget(qrUrl: string | null, supabaseUrl: string): QrTarget {
  const fallback = { bucket: PAYMENT_QR_BUCKET, path: PAYMENT_QR_DEFAULT_PATH };
  if (!qrUrl) return fallback;
  let url: URL;
  let base: URL;
  try {
    url = new URL(qrUrl);
    base = new URL(supabaseUrl);
  } catch {
    return fallback;
  }
  const prefix = "/storage/v1/object/public/";
  if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return fallback;
  }
  const [bucket, ...rest] = decoded.split("/");
  if (!bucket || rest.length === 0 || rest.some((p) => !p || p === "." || p === "..")) return fallback;
  return { bucket, path: rest.join("/") };
}

/** Public URL plus a version so the admin preview never shows a cached older image. */
export function paymentQrViewUrl(publicUrl: string, updatedAt: string | null): string {
  return updatedAt ? `${publicUrl}?v=${encodeURIComponent(updatedAt)}` : publicUrl;
}
