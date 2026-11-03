/**
 * Whether a product is ready to publish. New products are created unpublished
 * (migration 049) with 0 units: a variant's available units come from its
 * components (v_variant_availability), and until real insumos are assigned the
 * only component is the variant's own 1:1 self item with stock 0. Publishing
 * then would show "Agotado" in the store and SIN_VARIANTES_DISPONIBLES on
 * WhatsApp. No server dependencies.
 */

export const UNPUBLISHED_NOTICE = "Producto sin publicar: asigna los insumos de cada variante y luego publícalo.";

type VariantComponents<C extends { stockItemId: string } = { stockItemId: string }> = {
  selfItemId: string | null;
  components: C[];
};

/** The only component is the variant's own self item (no insumos assigned). */
export function isSelfOnlyVariant(variant: VariantComponents): boolean {
  return (
    variant.selfItemId !== null &&
    variant.components.length === 1 &&
    variant.components[0].stockItemId === variant.selfItemId
  );
}

/**
 * Notice for the editor, or null when the product is published. Lists the
 * active variants still without insumos and, for crisalidas, the ones whose
 * chrysalis count is undefined (NULL: production leaves them out of totals).
 */
export function unpublishedNotice(
  published: boolean,
  variants: (VariantComponents & { sku: string; is_active: boolean; chrysalisCount?: number | null })[],
  brand?: string,
): string | null {
  if (published) return null;
  const active = variants.filter((v) => v.is_active);
  const parts = [UNPUBLISHED_NOTICE];
  const noInsumos = active.filter(isSelfOnlyVariant).map((v) => v.sku);
  if (noInsumos.length > 0) parts.push(`Aún sin insumos asignados: ${noInsumos.join(", ")}.`);
  if (brand === "crisalidas") {
    const noCount = active.filter((v) => v.chrysalisCount === null).map((v) => v.sku);
    if (noCount.length > 0) parts.push(`Crisálidas sin definir: ${noCount.join(", ")}.`);
  }
  return parts.join(" ");
}

/**
 * Rows the recipe editor starts with. The mirror item is an implementation
 * detail, not an insumo: a self-only variant edits an empty recipe, and saving
 * real insumos replaces the whole recipe (set_variant_components).
 */
export function editableRecipeRows<C extends { stockItemId: string }>(variant: VariantComponents<C>): C[] {
  return isSelfOnlyVariant(variant) ? [] : variant.components;
}

/** Availability line of a variant card. Never names the mirror item as bottleneck. */
export function variantAvailabilityLabel(
  variant: VariantComponents & { availableUnits: number },
  bottleneckName: string | null,
): string {
  const base = `Disponible: ${variant.availableUnits}`;
  if (isSelfOnlyVariant(variant)) return `${base} · sin insumos asignados`;
  if (variant.availableUnits === 0 && variant.components.length === 0) return `${base} · sin componentes`;
  return bottleneckName ? `${base} · limita: ${bottleneckName}` : base;
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
