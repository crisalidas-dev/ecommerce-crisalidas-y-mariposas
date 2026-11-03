/**
 * Product-sheet fields the store and the WhatsApp assistant need, mirrored
 * from migration 048 (create_product_with_variant). The database enforces the
 * same rules; here they give inline feedback and keep the server action from
 * calling the RPC with data it will refuse. No server dependencies.
 *
 *   short_name : WhatsApp button title (Meta limit 20). get_product returns
 *                name when it fits in 20, short_name otherwise, so it is
 *                required only when the trimmed name is longer than 20.
 *   simbolismo : printed in the product sheet (store and WhatsApp). Required
 *                for crisalidas; always null for complementos.
 */

export const SHORT_NAME_MAX = 20;

export type ProductSheetInput = {
  brand: string;
  name: string;
  simbolismo?: string | null;
  shortName?: string | null;
};

export type ProductSheetErrors = { simbolismo: string | null; shortName: string | null };

/** Length in characters, like Postgres `char_length` (not UTF-16 code units). */
export function textLength(value: string): number {
  return [...value].length;
}

export function needsShortName(name: string): boolean {
  return textLength(name.trim()) > SHORT_NAME_MAX;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function productSheetValues(input: ProductSheetInput): { simbolismo: string | null; shortName: string | null } {
  return {
    simbolismo: input.brand === "crisalidas" ? clean(input.simbolismo) : null,
    shortName: clean(input.shortName),
  };
}

export function productSheetErrors(input: ProductSheetInput): ProductSheetErrors {
  const { simbolismo, shortName } = productSheetValues(input);
  return { simbolismo: simbolismoError(input.brand, simbolismo), shortName: shortNameError(input.name, shortName) };
}

/** `shortName` already cleaned (trimmed, blank as null). */
function shortNameError(name: string, shortName: string | null): string | null {
  if (shortName && textLength(shortName) > SHORT_NAME_MAX) {
    return `El nombre corto admite máximo ${SHORT_NAME_MAX} caracteres (límite de los botones de WhatsApp).`;
  }
  if (!shortName && needsShortName(name)) {
    return `El nombre tiene más de ${SHORT_NAME_MAX} caracteres: escribe un nombre corto para el botón de WhatsApp.`;
  }
  return null;
}

/**
 * Rename of an existing product (the SKU never changes). The short name is
 * kept only when the name does not fit in 20: get_product ignores it otherwise.
 */
export function parseProductName(
  name: string,
  shortName: string | null | undefined,
): { ok: true; data: { name: string; shortName: string | null } } | { ok: false; error: string } {
  const cleanName = clean(name);
  if (!cleanName) return { ok: false, error: "El nombre del producto es obligatorio." };
  const cleanShort = needsShortName(cleanName) ? clean(shortName) : null;
  const error = shortNameError(cleanName, cleanShort);
  if (error) return { ok: false, error };
  return { ok: true, data: { name: cleanName, shortName: cleanShort } };
}

/** `simbolismo` already cleaned (trimmed, blank as null). */
function simbolismoError(brand: string, simbolismo: string | null): string | null {
  return brand === "crisalidas" && !simbolismo ? "El simbolismo es obligatorio en los productos de Crisálidas." : null;
}

/**
 * Description and simbolismo edited on an existing product. `brand` must come
 * from the database row, never from the client. Blank description is null;
 * simbolismo stays required for crisalidas and is always null otherwise.
 */
export function parseProductCopy(
  brand: string,
  input: { description?: string | null; simbolismo?: string | null },
): { ok: true; data: { description: string | null; simbolismo: string | null } } | { ok: false; error: string } {
  const simbolismo = brand === "crisalidas" ? clean(input.simbolismo) : null;
  const error = simbolismoError(brand, simbolismo);
  if (error) return { ok: false, error };
  return { ok: true, data: { description: clean(input.description), simbolismo } };
}

export function firstProductSheetError(errors: ProductSheetErrors): string | null {
  return errors.shortName ?? errors.simbolismo;
}

/** Spanish connectors that never end a suggested short name. */
const TRAILING_CONNECTORS = new Set([
  "de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "con", "para", "en", "a", "al",
]);

/**
 * Suggested short name for a name that does not fit in the WhatsApp button,
 * or null when none is needed. The person reviews it; the database stores
 * what they submit, it never generates it. Whitespace is collapsed, the cut
 * is at the last full word that fits, and trailing connectors are dropped
 * ("Experiencias de Colección" -> "Experiencias"). A first word longer than
 * 20 is hard-cut. Never empty for a non-blank name.
 */
export function suggestShortName(name: string): string | null {
  const collapsed = name.trim().replace(/\s+/g, " ");
  if (!needsShortName(collapsed)) return null;

  const words = collapsed.split(" ");
  if (textLength(words[0]) > SHORT_NAME_MAX) {
    return [...words[0]].slice(0, SHORT_NAME_MAX).join("");
  }

  const fitting: string[] = [];
  for (const word of words) {
    if (textLength([...fitting, word].join(" ")) > SHORT_NAME_MAX) break;
    fitting.push(word);
  }

  const trimmed = [...fitting];
  while (trimmed.length > 0 && TRAILING_CONNECTORS.has(trimmed[trimmed.length - 1].toLocaleLowerCase("es"))) {
    trimmed.pop();
  }
  // Only connectors fit: keep the cut rather than return nothing.
  return (trimmed.length > 0 ? trimmed : fitting).join(" ");
}

/**
 * Short-name field of the product forms. Hidden while the name fits in 20;
 * otherwise it shows the user's edit, or the live suggestion while they have
 * not edited it (`edited` null).
 */
export function shortNameField(name: string, edited: string | null): { show: boolean; value: string } {
  const suggestion = suggestShortName(name);
  if (suggestion === null) return { show: false, value: "" };
  return { show: true, value: edited ?? suggestion };
}
