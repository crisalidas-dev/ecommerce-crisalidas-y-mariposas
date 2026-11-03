/**
 * Money inputs of the admin panel: whole COP, never decimals or floats
 * (CLAUDE.md). The visible text shows es-CO thousands separators ("150.000");
 * the form submits the raw integer. No server dependencies.
 */

/** Postgres `integer` max: base_price and the RPCs that receive it are int4. */
export const COP_AMOUNT_MAX = 2_147_483_647;

const groupFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0, useGrouping: true });

/**
 * Integer from whatever was typed or pasted: every non-digit is ignored, so
 * separators, "$", spaces and signs never reach the value.
 *   null      -> there are no digits (empty field)
 *   undefined -> more than COP_AMOUNT_MAX: the input keeps its previous value
 */
export function parseCopAmount(text: string): number | null | undefined {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (digits === "") return null;
  if (digits.length > String(COP_AMOUNT_MAX).length) return undefined;
  const value = Number(digits);
  return value > COP_AMOUNT_MAX ? undefined : value;
}

export function formatCopAmount(value: number | null): string {
  return value === null ? "" : groupFormat.format(value);
}

/** Caret index in `formatted` right after its first `digitCount` digits. */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}
