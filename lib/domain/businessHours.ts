/**
 * Pure helpers for `public.business_hours`: one row per OPEN weekday
 * (0 = Sunday ... 6 = Saturday); a missing row means closed that day.
 */

/** Display order: Monday first, Sunday last. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export interface DaySchedule {
  weekday: number;
  open: boolean;
  /** "HH:MM" (24h). Kept even when closed so the inputs have a value to show. */
  opensAt: string;
  closesAt: string;
}

export interface BusinessHoursRow {
  weekday: number;
  opens_at: string;
  closes_at: string;
}

const DEFAULT_OPENS = "08:00";
const DEFAULT_CLOSES = "17:00";
const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

/** Postgres `time` ("08:00:00") or input[type=time] ("08:00") to "HH:MM"; null when invalid. */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = TIME.exec(value.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

export function buildWeekSchedule(rows: BusinessHoursRow[]): DaySchedule[] {
  const byDay = new Map(rows.map((r) => [Number(r.weekday), r]));
  return WEEKDAY_ORDER.map((weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      open: Boolean(row),
      opensAt: (row && normalizeTime(row.opens_at)) || DEFAULT_OPENS,
      closesAt: (row && normalizeTime(row.closes_at)) || DEFAULT_CLOSES,
    };
  });
}

export function parseWeekSchedule(
  raw: unknown,
):
  | { ok: true; upserts: BusinessHoursRow[]; deletes: number[] }
  | { ok: false; errors: Record<string, string> } {
  if (!Array.isArray(raw)) return { ok: false, errors: { schedule: "Horario inválido." } };

  const errors: Record<string, string> = {};
  const upserts: BusinessHoursRow[] = [];
  const deletes: number[] = [];
  const seen = new Set<number>();

  for (const item of raw) {
    const d = (item ?? {}) as Partial<DaySchedule>;
    const weekday = d.weekday;
    if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 || seen.has(weekday)) {
      return { ok: false, errors: { schedule: "Horario inválido." } };
    }
    seen.add(weekday);

    if (!d.open) {
      deletes.push(weekday);
      continue;
    }
    const opens = normalizeTime(d.opensAt);
    const closes = normalizeTime(d.closesAt);
    if (!opens || !closes) {
      errors[`day:${weekday}`] = "Indica la hora de apertura y de cierre.";
    } else if (closes <= opens) {
      errors[`day:${weekday}`] = "La hora de cierre debe ser posterior a la de apertura.";
    } else {
      upserts.push({ weekday, opens_at: opens, closes_at: closes });
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, upserts, deletes };
}
