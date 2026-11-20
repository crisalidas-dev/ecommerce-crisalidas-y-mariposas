import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  CATALOG_BUCKET,
  CATALOG_CACHE_CONTROL,
  CATALOG_FILE_NAME,
  CATALOG_FOLDER,
  CATALOG_PATH,
} from "@/lib/domain/catalogPdf";

export type CatalogInfo = {
  publicUrl: string;
  /** `null` when the object does not exist (or storage could not be read). */
  file: { size: number; updatedAt: string | null } | null;
};

export async function getCatalogInfo(): Promise<CatalogInfo> {
  const storage = createAdminClient().storage.from(CATALOG_BUCKET);
  const publicUrl = storage.getPublicUrl(CATALOG_PATH).data.publicUrl;
  const { data, error } = await storage.list(CATALOG_FOLDER, { search: CATALOG_FILE_NAME, limit: 10 });
  if (error) {
    console.error("getCatalogInfo: no se pudo leer el catálogo", error.message);
    return { publicUrl, file: null };
  }
  const item = data?.find((o) => o.name === CATALOG_FILE_NAME);
  if (!item) return { publicUrl, file: null };
  const size = Number((item.metadata as { size?: number } | null)?.size ?? 0);
  return { publicUrl, file: { size, updatedAt: item.updated_at ?? item.created_at ?? null } };
}

/** Overwrites the object in place (atomic): on failure the old file stays. */
export async function replaceCatalog(bytes: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient()
    .storage.from(CATALOG_BUCKET)
    .upload(CATALOG_PATH, bytes, {
      upsert: true,
      contentType: "application/pdf",
      cacheControl: CATALOG_CACHE_CONTROL,
    });
  return error ? { ok: false, error: error.message } : { ok: true };
}
