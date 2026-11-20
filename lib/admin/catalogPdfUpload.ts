import { CATALOG_TOO_BIG, MAX_CATALOG_BYTES, validateCatalogPdf } from "../domain/catalogPdf.ts";

export type CatalogUploadDeps = {
  authorize: () => Promise<{ ok: true } | { ok: false; status: number; error: string }>;
  upload: (bytes: Uint8Array) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Multipart framing on top of the file itself. */
const MULTIPART_OVERHEAD = 64 * 1024;

function json(status: number, body: { ok: true } | { ok: false; error: string }) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

const TOO_BIG = CATALOG_TOO_BIG;

/**
 * Logic of the catalog upload Route Handler, with auth and storage injected so
 * it runs without Next or Supabase. Authorization comes first: nothing about
 * the body is read for an unauthorized caller.
 */
export async function handleCatalogPdfUpload(request: Request, deps: CatalogUploadDeps): Promise<Response> {
  const auth = await deps.authorize();
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES + MULTIPART_OVERHEAD) {
    return json(413, { ok: false, error: TOO_BIG });
  }

  let entry: FormDataEntryValue | null;
  try {
    entry = (await request.formData()).get("file");
  } catch {
    return json(400, { ok: false, error: "No se pudo leer el archivo enviado." });
  }
  if (!(entry instanceof File)) return json(400, { ok: false, error: "Selecciona el archivo PDF del catálogo." });

  const checked = validateCatalogPdf(entry, new Uint8Array(await entry.slice(0, 8).arrayBuffer()));
  if (!checked.ok) return json(checked.error === TOO_BIG ? 413 : 400, checked);

  const uploaded = await deps.upload(new Uint8Array(await entry.arrayBuffer()));
  if (!uploaded.ok) {
    return json(502, {
      ok: false,
      error: `No se pudo subir el catálogo: ${uploaded.error}. El catálogo publicado sigue siendo el anterior.`,
    });
  }
  return json(200, { ok: true });
}
