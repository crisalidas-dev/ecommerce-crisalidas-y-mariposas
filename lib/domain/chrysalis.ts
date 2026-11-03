/**
 * Crisálidas de una línea de pedido. `product_variants.chrysalis_count` son
 * las de UNA unidad; los adicionales (`reservations.options`) también van por
 * unidad de la línea. Módulo puro, sin acceso a datos.
 */

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Un adicional es de crisálida si su nombre, sin tildes ni mayúsculas, contiene "crisalida". */
export function isChrysalisExtra(nombre: unknown): boolean {
  return typeof nombre === "string" && normalize(nombre).includes("crisalida");
}

/** Cantidad por unidad de un adicional: la que trae, o 1 si falta o no es un número válido. */
export function optionQty(qty: unknown): number {
  const n = Number(qty);
  return qty !== undefined && qty !== null && Number.isFinite(n) && n >= 0 ? n : 1;
}

/** Crisálidas adicionales por unidad. `options` es JSON libre: lo que no sea arreglo de objetos suma 0. */
export function chrysalisExtrasPerUnit(options: unknown): number {
  if (!Array.isArray(options)) return 0;
  let total = 0;
  for (const option of options) {
    if (typeof option !== "object" || option === null) continue;
    const { nombre, qty } = option as { nombre?: unknown; qty?: unknown };
    if (isChrysalisExtra(nombre)) total += optionQty(qty);
  }
  return total;
}

/**
 * `qty × (chrysalis_count + adicionales por unidad)`. Un conteo nulo es "sin
 * definir" (`null`), distinto de 0: la línea no suma a ningún total.
 */
export function lineChrysalis(qty: number, chrysalisCount: number | null, options: unknown): number | null {
  if (chrysalisCount === null) return null;
  return qty * (chrysalisCount + chrysalisExtrasPerUnit(options));
}

/** Upper bound of the panel input; the column only checks >= 0. */
export const CHRYSALIS_COUNT_MAX = 999;

/**
 * product_variants.chrysalis_count as typed in the panel. Crisálidas: an
 * integer 0..999, required (0 = carries none; NULL would mean "sin definir"
 * and production would leave the line out of every total). Other brands
 * carry no chrysalises: the value must be absent and is stored as NULL.
 */
export function parseChrysalisCount(
  brand: string,
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (brand !== "crisalidas") {
    return text === "" ? { ok: true, value: null } : { ok: false, error: "Solo los productos de Crisálidas llevan crisálidas." };
  }
  if (text === "") return { ok: false, error: "Indica cuántas crisálidas lleva la variante (0 si no lleva)." };
  if (!/^\d+$/.test(text)) return { ok: false, error: "Las crisálidas deben ser un número entero mayor o igual a 0." };
  const value = Number(text);
  if (value > CHRYSALIS_COUNT_MAX) return { ok: false, error: `Las crisálidas admiten máximo ${CHRYSALIS_COUNT_MAX}.` };
  return { ok: true, value };
}
