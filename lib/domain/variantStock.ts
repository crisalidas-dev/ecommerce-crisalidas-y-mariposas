/**
 * Base stock of a variant (`product_variants.stock_qty`) as typed in the panel.
 * An integer between 0 and VARIANT_STOCK_MAX; an empty value means 0. The
 * sellable units still come from `available_units` (stock minus live
 * reservations), and `disponibilidad` rules over stock: this only validates
 * what the admin writes. Pure module.
 */

export const VARIANT_STOCK_MAX = 100000;

export function parseVariantStock(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (text === "") return { ok: true, value: 0 };
  if (!/^\d+$/.test(text)) return { ok: false, error: "El stock debe ser un número entero mayor o igual a 0." };
  const value = Number(text);
  if (value > VARIANT_STOCK_MAX) return { ok: false, error: `El stock admite máximo ${VARIANT_STOCK_MAX}.` };
  return { ok: true, value };
}
