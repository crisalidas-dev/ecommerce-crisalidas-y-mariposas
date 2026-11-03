import { brandSkuPrefix, isValidLineCode, normalizeLineCode } from "./sku.ts";

export interface ProductLine {
  id: string;
  brand: string;
  code: string;
  name: string;
  is_active: boolean;
}

export type NewLineInput = { brand: string; name: string; code: string };

export function parseNewLineInput(
  input: NewLineInput,
): { ok: true; data: NewLineInput } | { ok: false; error: string } {
  if (!brandSkuPrefix(input.brand)) return { ok: false, error: "Elige una marca que venda en el sitio." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre de la línea es obligatorio." };
  const code = normalizeLineCode(input.code);
  if (!isValidLineCode(code)) {
    return { ok: false, error: "El código debe tener exactamente 3 letras (A-Z), sin números ni tildes." };
  }
  return { ok: true, data: { brand: input.brand, name, code } };
}

export function activeLinesOfBrand<T extends { brand: string; is_active: boolean }>(lines: T[], brand: string): T[] {
  return lines.filter((l) => l.brand === brand && l.is_active);
}

export function formatLineLabel(line: { name: string; code: string }): string {
  return `${line.name} (${line.code})`;
}
