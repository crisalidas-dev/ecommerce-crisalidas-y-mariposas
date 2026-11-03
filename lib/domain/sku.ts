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

/** Highest -VNN allowed by the fixed two-digit format (047: VARIANTES_AGOTADAS past it). */
export const VARIANT_NUMBER_MAX = 99;

/**
 * SKU the next variant will get, as create_variant_with_stock computes it:
 * max(products.last_variant_number, highest -VNN of its variants) + 1, so a
 * deleted variant's number is never handed out again. Null past V99.
 */
export function nextVariantSku(productSku: string, variantSkus: string[], lastVariantNumber: number): string | null {
  const highest = variantSkus.reduce((max, sku) => {
    const match = /-V(\d{2})$/.exec(sku);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const next = Math.max(lastVariantNumber, highest) + 1;
  return next > VARIANT_NUMBER_MAX ? null : variantSkuPreview(productSku, next);
}

/** Attribute key to prefill a new variant with: the one its siblings use ("color"). */
export function attributeKeySuggestion(
  variants: { is_active: boolean; attributes: Record<string, unknown> | null }[],
): string {
  for (const v of variants) {
    if (!v.is_active || !v.attributes) continue;
    const key = Object.keys(v.attributes).find((k) => k.trim() !== "");
    if (key) return key;
  }
  return "";
}

type VariantNaming = { id: string; is_active: boolean; attributes: Record<string, unknown> | null };

function hasOtherActive(variant: VariantNaming, siblings: VariantNaming[]): boolean {
  return siblings.some((s) => s.id !== variant.id && s.is_active);
}

/**
 * Whether the switch may turn the variant on. Mirrors the trigger
 * product_variants_enforce_names: with 2+ active variants all need a name, so
 * an unnamed variant cannot be activated next to an active one. Turning a
 * variant off is never blocked here.
 */
export function canActivateVariant(
  variant: VariantNaming,
  siblings: VariantNaming[],
): { ok: true } | { ok: false; reason: string } {
  if (variant.is_active) return { ok: true };
  if (variantDisplayName(variant.attributes) === null && hasOtherActive(variant, siblings)) {
    return { ok: false, reason: "Ponle nombre antes de activarla" };
  }
  return { ok: true };
}

/**
 * Title of a variant card. "Variante única" only for an unnamed variant with
 * no other active variant; next to an active one it is "Sin nombre" (the UI
 * shows it as a warning).
 */
export function variantCardLabel(variant: VariantNaming, siblings: VariantNaming[]): { text: string; unnamed: boolean } {
  const entries = Object.entries(variant.attributes ?? {}).filter(([, value]) => String(value ?? "").trim() !== "");
  if (entries.length > 0) return { text: entries.map(([k, value]) => `${k}: ${value}`).join(", "), unnamed: false };
  return { text: hasOtherActive(variant, siblings) ? "Sin nombre" : "Variante única", unnamed: true };
}

/**
 * New attributes of a renamed variant: one attribute, { key: value }. An empty
 * value clears the name ({}); the trigger refuses it if 2+ variants are active.
 * A variant with several attributes is refused rather than losing the others
 * (none exist today; the panel only creates one attribute per variant).
 */
export function parseVariantAttributes(
  key: string,
  value: string,
  current: Record<string, unknown> | null,
): { ok: true; attributes: Record<string, string> } | { ok: false; error: string } {
  if (Object.keys(current ?? {}).length > 1) {
    return { ok: false, error: "Esta variante tiene varios atributos: no se puede renombrar desde aquí." };
  }
  const cleanValue = value.trim();
  if (cleanValue === "") return { ok: true, attributes: {} };
  const cleanKey = key.trim();
  if (cleanKey === "") return { ok: false, error: "Indica el atributo (por ejemplo, color)." };
  const nameError = variantNameError(cleanValue);
  if (nameError) return { ok: false, error: nameError };
  return { ok: true, attributes: { [cleanKey]: cleanValue } };
}

/** Rename fields prefill: the variant's own attribute, or the siblings' key when it has none. */
export function renamePrefill(variant: VariantNaming, siblings: VariantNaming[]): { key: string; value: string } {
  const [entry] = Object.entries(variant.attributes ?? {});
  if (entry) return { key: entry[0], value: String(entry[1] ?? "") };
  return { key: attributeKeySuggestion(siblings.filter((s) => s.id !== variant.id)), value: "" };
}
