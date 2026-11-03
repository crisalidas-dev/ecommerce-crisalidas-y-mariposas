"use server";

import { revalidatePath } from "next/cache";
import { requireSettingsEditor } from "@/lib/admin/settingsGuard";
import {
  deleteHoliday,
  insertHoliday,
  saveWeekSchedule,
  updateBusinessSettings,
} from "@/lib/data/business-settings";
import { parseWeekSchedule } from "@/lib/domain/businessHours";
import {
  mapBusinessSettingsDbError,
  parseBusinessSettingsInput,
  toBusinessSettingsUpdate,
  type BusinessSettingsField,
} from "@/lib/domain/businessSettings";
import { mapHolidayDbError, parseHolidayInput } from "@/lib/domain/holidays";
import { bogotaDate } from "@/lib/domain/checkout/deliveryCalendar";

const PATH = "/admin/configuracion";

export type SettingsFormState = {
  error: string | null;
  fieldErrors: Partial<Record<BusinessSettingsField, string>>;
  saved?: boolean;
};

/** Writes `business_settings` (UPDATE of the single row id = true; never insert/upsert). */
export async function saveBusinessSettings(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const guard = await requireSettingsEditor();
  if (!guard.ok) return { error: guard.error, fieldErrors: {} };

  const parsed = parseBusinessSettingsInput(Object.fromEntries(formData));
  if (!parsed.ok) {
    return { error: "Revisa los campos marcados.", fieldErrors: parsed.errors };
  }

  const dbError = await updateBusinessSettings(toBusinessSettingsUpdate(parsed.data, guard.actor));
  if (dbError) {
    const mapped = mapBusinessSettingsDbError(dbError);
    return {
      error: mapped.field ? "Revisa los campos marcados." : mapped.error,
      fieldErrors: mapped.field ? { [mapped.field]: mapped.error } : {},
    };
  }
  revalidatePath(PATH);
  return { error: null, fieldErrors: {}, saved: true };
}

export type HoursResult = { ok: true } | { ok: false; error: string; fieldErrors: Record<string, string> };

/** Writes `business_hours`: upserts open days, deletes the rows of closed days. */
export async function saveBusinessHours(schedule: unknown): Promise<HoursResult> {
  const guard = await requireSettingsEditor();
  if (!guard.ok) return { ok: false, error: guard.error, fieldErrors: {} };

  const parsed = parseWeekSchedule(schedule);
  if (!parsed.ok) return { ok: false, error: "Revisa los días marcados.", fieldErrors: parsed.errors };

  const dbError = await saveWeekSchedule(parsed.upserts, parsed.deletes);
  if (dbError) {
    return {
      ok: false,
      error:
        dbError.code === "42501"
          ? "No se pudo guardar: la base de datos no otorga el permiso necesario. Avisa al equipo técnico."
          : "No se pudo guardar el horario. Inténtalo de nuevo.",
      fieldErrors: {},
    };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export type HolidayFormState = {
  error: string | null;
  fieldErrors: Record<string, string>;
  added?: boolean;
};

/** Inserts one row in `holidays` (the whole day closes). */
export async function addHoliday(_prev: HolidayFormState, formData: FormData): Promise<HolidayFormState> {
  const guard = await requireSettingsEditor();
  if (!guard.ok) return { error: guard.error, fieldErrors: {} };

  const parsed = parseHolidayInput(
    { date: formData.get("date"), name: formData.get("name") },
    bogotaDate(new Date()),
  );
  if (!parsed.ok) return { error: "Revisa los campos marcados.", fieldErrors: parsed.errors };

  const dbError = await insertHoliday(parsed.data);
  if (dbError) return { error: mapHolidayDbError(dbError), fieldErrors: {} };
  revalidatePath(PATH);
  return { error: null, fieldErrors: {}, added: true };
}

/** Deletes one row of `holidays` by date. */
export async function removeHoliday(date: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireSettingsEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Fecha no válida." };

  const dbError = await deleteHoliday(date);
  if (dbError) return { ok: false, error: mapHolidayDbError(dbError) };
  revalidatePath(PATH);
  return { ok: true };
}
