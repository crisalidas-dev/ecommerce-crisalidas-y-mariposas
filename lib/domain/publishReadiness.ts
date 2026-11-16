/**
 * Whether a product is ready to publish. New products are created unpublished
 * (migration 049). Variants are sold directly from their own stock, so the only
 * readiness hint left is the chrysalis count of crisalidas variants. No server
 * dependencies.
 */

export const UNPUBLISHED_NOTICE = "Producto sin publicar: revisa el stock de cada variante y luego publícalo.";

/**
 * Notice for the editor, or null when the product is published. For crisalidas
 * it lists the active variants whose chrysalis count is undefined (NULL:
 * production leaves them out of totals).
 */
export function unpublishedNotice(
  published: boolean,
  variants: { sku: string; is_active: boolean; chrysalisCount?: number | null }[],
  brand?: string,
): string | null {
  if (published) return null;
  const active = variants.filter((v) => v.is_active);
  const parts = [UNPUBLISHED_NOTICE];
  if (brand === "crisalidas") {
    const noCount = active.filter((v) => v.chrysalisCount === null).map((v) => v.sku);
    if (noCount.length > 0) parts.push(`Crisálidas sin definir: ${noCount.join(", ")}.`);
  }
  return parts.join(" ");
}

/** Availability line of a variant card: sellable units (`available_units`). */
export function variantAvailabilityLabel(variant: { availableUnits: number }): string {
  return `Disponible: ${variant.availableUnits}`;
}

export type VariantStatusDisplay = {
  label: "Activa" | "Inactiva";
  /** Verb of the toggle, for its accessible name ("Desactivar variante <label>"). */
  action: "Desactivar variante" | "Activar variante";
  tone: "live" | "muted" | "warning";
  note: string | null;
};

/**
 * Variant toggle (product_variants.is_active). It is not product publication:
 * an active variant of an unpublished product is not visible, so it must not
 * look live.
 */
export function variantStatusDisplay(productPublished: boolean, variantActive: boolean): VariantStatusDisplay {
  if (!variantActive) return { label: "Inactiva", action: "Activar variante", tone: "warning", note: null };
  if (!productPublished) {
    return {
      label: "Activa",
      action: "Desactivar variante",
      tone: "muted",
      note: "No visible: el producto no está publicado",
    };
  }
  return { label: "Activa", action: "Desactivar variante", tone: "live", note: null };
}

/**
 * Why a variant cannot be deleted from the editor, or null when it can. Mirrors
 * delete_variant (051), which enforces it again: a variant with orders is
 * deactivated instead, and the last variant goes with the product.
 */
export function variantDeleteBlock(variant: { hasOrderHistory: boolean }, variantCount: number): string | null {
  if (variantCount <= 1) return "Es la única variante: elimina el producto.";
  if (variant.hasOrderHistory) return "Tiene pedidos: no se puede eliminar. Desactívala para que deje de ofrecerse.";
  return null;
}
