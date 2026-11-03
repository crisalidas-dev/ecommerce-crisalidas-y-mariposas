/**
 * Lógica pura de recetas de insumos (plan "productos compuestos por insumos").
 * La disponibilidad oficial la calcula la vista `v_variant_availability`;
 * `computeRecipeAvailability` replica esa regla solo para la vista previa del
 * editor antes de guardar.
 */

export interface RecipeRow {
  stockItemId: string;
  qtyRequired: number;
}

export interface ItemAvailability {
  available: number;
  isActive: boolean;
}

export interface RecipeAvailability {
  availableUnits: number;
  bottleneckItemId: string | null;
}

export function computeRecipeAvailability(
  rows: RecipeRow[],
  items: Record<string, ItemAvailability>,
): RecipeAvailability {
  if (rows.length === 0) return { availableUnits: 0, bottleneckItemId: null };

  let best: RecipeAvailability | null = null;
  for (const row of rows) {
    const item = items[row.stockItemId];
    const units =
      !item || !item.isActive || row.qtyRequired <= 0
        ? 0
        : Math.floor(Math.max(item.available, 0) / row.qtyRequired);
    if (best === null || units < best.availableUnits) {
      best = { availableUnits: units, bottleneckItemId: row.stockItemId };
    }
  }
  return best ?? { availableUnits: 0, bottleneckItemId: null };
}

export type RecipeValidation =
  | { ok: true }
  | { ok: false; error: "RECETA_VACIA" | "COMPONENTES_INVALIDOS" };

export function validateRecipeRows(
  rows: RecipeRow[],
  options: { allowEmpty?: boolean } = {},
): RecipeValidation {
  if (rows.length === 0) {
    return options.allowEmpty ? { ok: true } : { ok: false, error: "RECETA_VACIA" };
  }
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.stockItemId || seen.has(row.stockItemId)) {
      return { ok: false, error: "COMPONENTES_INVALIDOS" };
    }
    seen.add(row.stockItemId);
    if (!Number.isInteger(row.qtyRequired) || row.qtyRequired <= 0) {
      return { ok: false, error: "COMPONENTES_INVALIDOS" };
    }
  }
  return { ok: true };
}

const RPC_MESSAGES: Record<string, string> = {
  MODO_INVALIDO: "Modo de ajuste inválido.",
  CANTIDAD_INVALIDA: "La cantidad debe ser un número entero válido.",
  MOTIVO_REQUERIDO: "Indica el motivo del ajuste.",
  INSUMO_NO_EXISTE: "El insumo ya no existe.",
  STOCK_NEGATIVO: "El ajuste dejaría el stock negativo.",
  VARIANTE_NO_EXISTE: "La variante ya no existe.",
  OPCION_NO_EXISTE: "El adicional ya no existe.",
  COMPONENTES_INVALIDOS:
    "Hay componentes inválidos: cada insumo debe aparecer una vez con una cantidad entera mayor que cero.",
  RECETA_VACIA: "Una variante necesita al menos un componente.",
  SKU_INVALIDO: "El SKU no es válido.",
  STOCK_INVALIDO: "El stock inicial debe ser un entero mayor o igual a cero.",
  PRODUCTO_NO_EXISTE: "El producto ya no existe.",
  SKU_EN_USO: "Ese SKU ya está en uso.",
  NOMBRE_REQUERIDO: "El nombre es obligatorio.",
  ORIGEN_INVALIDO: "Elige el origen del insumo.",
  VARIANTE_SOLO_TALLER: "Solo los insumos hechos en taller pueden tener variantes.",
  SKU_BASE_INVALIDO: "El insumo base no tiene una referencia válida para derivar variantes.",
  SUFIJOS_AGOTADOS: "Ese insumo ya no admite más variantes.",
  SECUENCIA_AGOTADA: "Se agotó la secuencia de referencias para este origen.",
  VARIANTE_SIN_NOMBRE: "Con dos o más variantes activas, todas necesitan nombre.",
  NOMBRE_VARIANTE_DUPLICADO: "Dos variantes activas del producto no pueden tener el mismo nombre.",
  NOMBRE_VARIANTE_LARGO: "El nombre de la variante admite máximo 20 caracteres (límite de los botones de WhatsApp).",
  SIN_VARIANTE_POR_NOMBRAR: "No hay una única variante sin nombre para nombrar. Recarga el producto.",
  ATRIBUTOS_INVALIDOS: "Los atributos de la variante no son válidos.",
  VARIANTES_AGOTADAS: "Este producto ya usó los 99 números de variante (V01 a V99). Crea un producto nuevo.",
  PRECIO_INVALIDO: "El precio base debe ser un entero en pesos mayor o igual a cero.",
  LINEA_NO_EXISTE: "Esa línea de producto ya no existe.",
  LINEA_INACTIVA: "Esa línea de producto está desactivada.",
  MARCA_INVALIDA: "La línea pertenece a una marca que no vende en el sitio.",
  NOMBRE_SIN_CARACTERES_VALIDOS: "El nombre debe tener al menos una letra o un número para generar el SKU.",
  SKU_AGOTADO: "Hay demasiados productos con ese nombre en esa línea. Cambia el nombre.",
};

export function rpcErrorMessage(code: string | undefined | null, fallback?: string): string {
  if (code && RPC_MESSAGES[code]) return RPC_MESSAGES[code];
  return fallback || "No se pudo completar la operación.";
}

/**
 * Error de PostgREST en una escritura directa. Los triggers de nombre de
 * variante llegan como P0001 con `message` = código; una violación única
 * (23505) en `product_lines` es un código de línea repetido.
 */
export function postgrestErrorMessage(error: { code?: string; message?: string; details?: string | null }): string {
  if (error.code === "23505") return "Ya existe una línea con ese código en esta marca. Cambia el código.";
  if (error.code === "P0001" && error.message && RPC_MESSAGES[error.message]) {
    return error.details || RPC_MESSAGES[error.message];
  }
  return "No se pudo completar la operación.";
}
