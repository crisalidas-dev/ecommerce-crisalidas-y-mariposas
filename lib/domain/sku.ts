/**
 * SKU rules mirrored from migration 047 (product_sku_generation). The database
 * generates the real SKU; everything here is for previews and client-side
 * validation only. No server dependencies: usable from client, server and tests.
 *
 *   product sku = {CRI|COM}-{line code}-{slug(name)}[-N]
 *   variant sku = {product sku}-V{NN}
 */

export const SKU_SLUG_MAX = 12;
export const VARIANT_NAME_MAX = 20;

const BRAND_PREFIX: Record<string, string> = {
  crisalidas: "CRI",
  complementos: "COM",
};

export function brandSkuPrefix(brand: string): string | null {
  return BRAND_PREFIX[brand] ?? null;
}

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Same rule as the `product_sku_slug` RPC: no accents, uppercase, A-Z0-9, max 12. */
export function skuSlug(name: string): string {
  return stripAccents(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, SKU_SLUG_MAX);
}

/** Product SKU the database will assign (without the `-N` collision suffix). */
export function productSkuPreview(brand: string, lineCode: string, name: string): string | null {
  const prefix = brandSkuPrefix(brand);
  const slug = skuSlug(name);
  if (!prefix || !isValidLineCode(lineCode) || !slug) return null;
  return `${prefix}-${lineCode}-${slug}`;
}

export function variantSkuPreview(productSku: string | null, number = 1): string | null {
  if (!productSku) return null;
  return `${productSku}-V${String(number).padStart(2, "0")}`;
}

/** Uppercase A-Z only, no accents, at most 3 characters (what the user may type). */
export function normalizeLineCode(input: string): string {
  return stripAccents(input)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

export function isValidLineCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** First 3 letters of the name; shorter when the name has fewer letters. */
export function suggestLineCode(name: string): string {
  return normalizeLineCode(name);
}

/**
 * Variant name as the database computes it (`variant_display_name`): non-blank
 * attribute values, trimmed, joined with one space. The WhatsApp button title.
 */
export function variantDisplayName(attributes: Record<string, unknown> | null | undefined): string | null {
  if (!attributes) return null;
  const parts = Object.values(attributes)
    .map((v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim()))
    .filter((v) => v !== "");
  return parts.length > 0 ? parts.join(" ") : null;
}

export function variantNameError(name: string): string | null {
  if (name.trim().length > VARIANT_NAME_MAX) {
    return `El nombre de la variante admite máximo ${VARIANT_NAME_MAX} caracteres (límite de los botones de WhatsApp).`;
  }
  return null;
}

/**
 * The variant that must be named when a second one is added: only when the
 * product has exactly one active variant and it has no name.
 */
export function unnamedVariantToName<T extends { is_active: boolean; attributes: Record<string, unknown> | null }>(
  variants: T[],
): T | null {
  const active = variants.filter((v) => v.is_active);
  if (active.length !== 1) return null;
  return variantDisplayName(active[0].attributes) === null ? active[0] : null;
}
