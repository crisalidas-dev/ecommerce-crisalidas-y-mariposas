import { IMAGE_BUCKET } from "./imageUpload.ts";

/** Same public bucket as the product photos. */
export const CATALOG_BUCKET = IMAGE_BUCKET;
/**
 * Fixed on purpose: the n8n WhatsApp workflow sends the catalog by this public
 * URL. Never version the path; replace the object in place (`upsert`).
 */
export const CATALOG_PATH = "catalogo/catalogo.pdf";
export const CATALOG_FOLDER = "catalogo";
export const CATALOG_FILE_NAME = "catalogo.pdf";
/** Single source of truth for the upload cap; every message derives from it. */
export const MAX_CATALOG_MB = 40;
export const MAX_CATALOG_BYTES = MAX_CATALOG_MB * 1024 * 1024;
export const CATALOG_TOO_BIG = `El catálogo supera ${MAX_CATALOG_MB} MB.`;
/** Short CDN cache (seconds) so the previous catalog stops being served quickly. */
export const CATALOG_CACHE_CONTROL = "60";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type CatalogValidation = { ok: true } | { ok: false; error: string };

/**
 * `head` is the first bytes of the file. The magic bytes decide: MIME type and
 * extension come from the client and are not trusted, so a valid PDF with an
 * odd name or `application/octet-stream` is accepted, and a `.pdf` that is not
 * a PDF is rejected.
 */
export function validateCatalogPdf(file: { name: string; size: number }, head: Uint8Array): CatalogValidation {
  if (file.size === 0) return { ok: false, error: "Selecciona el archivo PDF del catálogo." };
  if (file.size > MAX_CATALOG_BYTES) return { ok: false, error: CATALOG_TOO_BIG };
  const isPdf = head.length >= PDF_SIGNATURE.length && PDF_SIGNATURE.every((byte, i) => head[i] === byte);
  if (!isPdf) return { ok: false, error: "El archivo no es un PDF válido." };
  return { ok: true };
}

/** `4,2 MB` (binary megabytes, one decimal, comma). */
export function formatCatalogSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** `19/11/2026 10:30 p. m.` in America/Bogota; `null` when missing or invalid. */
export function formatCatalogDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const text = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  // ICU versions differ on the date/time comma and use narrow no-break spaces.
  return text.replace(/,/g, "").replace(/\s+/g, " ");
}

/** Public URL plus a version so the browser never shows a cached older file. */
export function catalogViewUrl(publicUrl: string, updatedAt: string | null): string {
  return updatedAt ? `${publicUrl}?v=${encodeURIComponent(updatedAt)}` : publicUrl;
}

/** Same name the WhatsApp assistant uses when it sends the document. */
export const CATALOG_DOWNLOAD_NAME = "Catalogo Crisalidas y Mariposas.pdf";

/**
 * Supabase Storage serves `Content-Disposition: attachment` when the public URL
 * carries `download=<name>`. The HTML `download` attribute is ignored cross-origin.
 */
export function catalogDownloadUrl(publicUrl: string, updatedAt: string | null): string {
  const view = catalogViewUrl(publicUrl, updatedAt);
  const sep = view.includes("?") ? "&" : "?";
  return `${view}${sep}download=${encodeURIComponent(CATALOG_DOWNLOAD_NAME)}`;
}
