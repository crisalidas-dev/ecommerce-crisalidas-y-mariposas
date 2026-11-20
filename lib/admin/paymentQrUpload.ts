import {
  MAX_PAYMENT_QR_BYTES,
  PAYMENT_QR_TOO_BIG,
  validatePaymentQr,
  type QrContentType,
} from "../domain/paymentQr.ts";

export type PaymentQrUploadDeps = {
  authorize: () => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  /** `replaced: true` means the image was overwritten but a later step (row update) failed. */
  upload: (
    bytes: Uint8Array,
    contentType: QrContentType,
  ) => Promise<{ ok: true } | { ok: false; error: string; replaced?: boolean }>;
};

/** Multipart framing on top of the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

function json(status: number, body: { ok: true } | { ok: false; error: string }) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Logic of the payment QR upload Route Handler, with auth and storage injected
 * so it runs without Next or Supabase. Authorization comes first: nothing about
 * the body is read for an unauthorized caller.
 */
export async function handlePaymentQrUpload(request: Request, deps: PaymentQrUploadDeps): Promise<Response> {
  const auth = await deps.authorize();
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PAYMENT_QR_BYTES + MULTIPART_OVERHEAD) {
    return json(413, { ok: false, error: PAYMENT_QR_TOO_BIG });
  }

  let entry: FormDataEntryValue | null;
  try {
    entry = (await request.formData()).get("file");
  } catch {
    return json(400, { ok: false, error: "No se pudo leer el archivo enviado." });
  }
  if (!(entry instanceof File)) return json(400, { ok: false, error: "Selecciona la imagen del QR." });

  const checked = validatePaymentQr(entry, new Uint8Array(await entry.slice(0, 12).arrayBuffer()));
  if (!checked.ok) return json(checked.error === PAYMENT_QR_TOO_BIG ? 413 : 400, checked);

  const uploaded = await deps.upload(new Uint8Array(await entry.arrayBuffer()), checked.contentType);
  if (!uploaded.ok) {
    return json(502, {
      ok: false,
      error: uploaded.replaced
        ? `La imagen sí se reemplazó, pero no se pudo actualizar el enlace del QR: ${uploaded.error}. Inténtalo de nuevo.`
        : `No se pudo subir el QR: ${uploaded.error}. El QR publicado sigue siendo el anterior.`,
    });
  }
  return json(200, { ok: true });
}
