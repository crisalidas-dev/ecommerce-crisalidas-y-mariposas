/** Pure helpers for `public.holidays` (holiday_date date PK, name text). Each row closes the whole day. */

export interface HolidayRow {
  holiday_date: string;
  name: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_NAME = 100;

function isRealDate(iso: string): boolean {
  const m = ISO_DATE.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** `today` is the Bogota calendar date (`YYYY-MM-DD`); past dates are rejected, today is allowed. */
export function parseHolidayInput(
  raw: { date?: unknown; name?: unknown },
  today: string,
): { ok: true; data: HolidayRow } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";

  if (!isRealDate(date)) errors.date = "Elige una fecha válida.";
  else if (date < today) errors.date = "La fecha no puede ser anterior a hoy.";

  if (!name) errors.name = "El nombre del festivo es obligatorio.";
  else if (name.length > MAX_NAME) errors.name = `El nombre no puede superar ${MAX_NAME} caracteres.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { holiday_date: date, name } };
}

export function mapHolidayDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ese festivo ya está registrado.";
  if (error.code === "42501") {
    return "No se pudo guardar: la base de datos no otorga el permiso necesario. Avisa al equipo técnico.";
  }
  return "No se pudo guardar el cambio. Inténtalo de nuevo.";
}

/** "martes, 8 de diciembre de 2026" from a `YYYY-MM-DD` date, independent of the server timezone. */
export function formatHolidayDate(iso: string): string {
  if (!isRealDate(iso)) return iso;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}
