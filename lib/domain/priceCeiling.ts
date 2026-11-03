/**
 * Crisálidas price ceilings by collection (spec 001 §4.1). Exceeding one is a
 * WARNING, never a block (spec 002 §3.4.3): there is no CHECK in the database
 * either. Mariposas de Liberación has no ceiling; complementos have none.
 */
export const CRISALIDAS_PRICE_CEILING: Record<string, number> = {
  "Pequeños Milagros": 100000,
  "Instantes de Vida": 200000,
  "Grandes Transformaciones": 300000,
  "Experiencias de Colección": 350000,
};

export function priceCeilingWarning(brand: string, category: string | null | undefined, basePrice: number): string | null {
  if (brand !== "crisalidas" || !category) return null;
  const ceiling = CRISALIDAS_PRICE_CEILING[category];
  if (!ceiling || basePrice <= ceiling) return null;
  return `El precio supera el techo de "${category}" (${ceiling.toLocaleString("es-CO")} COP) — se guardó igual.`;
}
