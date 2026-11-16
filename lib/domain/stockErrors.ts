/**
 * Spanish messages for the error codes returned by the stock/catalog RPCs and
 * for direct PostgREST writes in the panel. Pure: no Supabase, no React.
 */

const RPC_MESSAGES: Record<string, string> = {
  MODO_INVALIDO: "Modo de ajuste inválido.",
  CANTIDAD_INVALIDA: "La cantidad debe ser un número entero válido.",
  MOTIVO_REQUERIDO: "Indica el motivo del ajuste.",
  INSUMO_NO_EXISTE: "El insumo ya no existe.",
  STOCK_NEGATIVO: "El ajuste dejaría el stock negativo.",
  VARIANTE_NO_EXISTE: "La variante ya no existe.",
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
  NOMBRE_CORTO_LARGO: "El nombre corto admite máximo 20 caracteres (límite de los botones de WhatsApp).",
  NOMBRE_CORTO_REQUERIDO:
    "El nombre tiene más de 20 caracteres: escribe un nombre corto para el botón de WhatsApp.",
  SIMBOLISMO_REQUERIDO: "El simbolismo es obligatorio en los productos de Crisálidas.",
  PRODUCTO_CON_HISTORIAL:
    "El producto tiene pedidos o reservas: no se puede eliminar. Puedes despublicarlo para que deje de verse en la tienda.",
  VARIANTE_CON_HISTORIAL:
    "La variante tiene pedidos o reservas: no se puede eliminar. Puedes desactivarla para que deje de ofrecerse.",
  ULTIMA_VARIANTE: "Es la única variante del producto: elimina el producto en su lugar.",
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
