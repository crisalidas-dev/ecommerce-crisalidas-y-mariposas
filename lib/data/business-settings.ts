import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { buildWeekSchedule, type BusinessHoursRow, type DaySchedule } from "@/lib/domain/businessHours";
import type { BusinessSettings, BusinessSettingsUpdate } from "@/lib/domain/businessSettings";
import type { HolidayRow } from "@/lib/domain/holidays";

/**
 * Data access for the Configuración section: `business_settings` (single row,
 * migration 046), `business_hours` and `holidays`. Rows are typed by hand (no
 * generated Supabase types), like `stock-items.ts`.
 *
 * Writes never insert/upsert `business_settings`: the row is seeded by the
 * migration and service_role only has SELECT + UPDATE on it.
 */

const SETTINGS_COLUMNS =
  "workshop_address, workshop_maps_url, chrysalis_warranty_days, terms_url, instagram_url, facebook_label, facebook_url, website, delivery_route_departure_text, updated_at, updated_by";

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("business_settings").select(SETTINGS_COLUMNS).eq("id", true).maybeSingle();
  if (error) throw error;
  return (data as BusinessSettings | null) ?? null;
}

export type DbError = { code?: string; message: string };

/** Returns the error, or null on success. Fails (no row) when the migration is not applied. */
export async function updateBusinessSettings(update: BusinessSettingsUpdate): Promise<DbError | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("business_settings").update(update).eq("id", true).select("id");
  if (error) return error;
  if (!data || data.length === 0) return { message: "business_settings row not found" };
  return null;
}

export async function getWeekSchedule(): Promise<DaySchedule[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("business_hours").select("weekday, opens_at, closes_at");
  if (error) throw error;
  return buildWeekSchedule((data ?? []) as BusinessHoursRow[]);
}

/** Upserts open days, then deletes closed ones (a missing row means closed). */
export async function saveWeekSchedule(upserts: BusinessHoursRow[], deletes: number[]): Promise<DbError | null> {
  const supabase = createAdminClient();
  if (upserts.length > 0) {
    const { error } = await supabase.from("business_hours").upsert(upserts, { onConflict: "weekday" });
    if (error) return error;
  }
  if (deletes.length > 0) {
    const { error } = await supabase.from("business_hours").delete().in("weekday", deletes);
    if (error) return error;
  }
  return null;
}

/** Holidays from `today` (Bogota `YYYY-MM-DD`) on, soonest first. */
export async function getUpcomingHolidays(today: string): Promise<HolidayRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("holidays")
    .select("holiday_date, name")
    .gte("holiday_date", today)
    .order("holiday_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as HolidayRow[]).map((r) => ({ holiday_date: String(r.holiday_date), name: r.name }));
}

export async function insertHoliday(row: HolidayRow): Promise<DbError | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("holidays").insert(row);
  return error ?? null;
}

export async function deleteHoliday(date: string): Promise<DbError | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("holidays").delete().eq("holiday_date", date);
  return error ?? null;
}
