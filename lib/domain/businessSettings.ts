import { z } from "zod";

/**
 * Pure validation and mapping for `public.business_settings` (single row,
 * migration 046). The rules mirror the table's CHECK constraints so the form
 * fails early with a per-field message; the database stays the authority.
 */

export const BUSINESS_SETTINGS_FIELDS = [
  "workshopAddress",
  "workshopMapsUrl",
  "chrysalisWarrantyDays",
  "termsUrl",
  "instagramUrl",
  "facebookLabel",
  "facebookUrl",
  "website",
  "deliveryRouteDepartureText",
] as const;

export type BusinessSettingsField = (typeof BUSINESS_SETTINGS_FIELDS)[number];

export interface BusinessSettingsInput {
  workshopAddress: string;
  workshopMapsUrl: string;
  chrysalisWarrantyDays: number;
  termsUrl: string;
  instagramUrl: string;
  facebookLabel: string;
  facebookUrl: string | null;
  website: string;
  deliveryRouteDepartureText: string;
}

/** Row as read from the table (snake_case, as stored). */
export interface BusinessSettings {
  workshop_address: string;
  workshop_maps_url: string;
  chrysalis_warranty_days: number;
  terms_url: string;
  instagram_url: string;
  facebook_label: string;
  facebook_url: string | null;
  website: string;
  delivery_route_departure_text: string;
  updated_at: string;
  updated_by: string | null;
}

/** Columns the panel writes: never `id` nor `updated_at` (trigger-stamped). */
export interface BusinessSettingsUpdate {
  workshop_address: string;
  workshop_maps_url: string;
  chrysalis_warranty_days: number;
  terms_url: string;
  instagram_url: string;
  facebook_label: string;
  facebook_url: string | null;
  website: string;
  delivery_route_departure_text: string;
  updated_by: string;
}

// Same pattern as the CHECK constraints: ^https?://\S+$
const HTTP_URL = /^https?:\/\/\S+$/;

const text = (message: string) => z.string().trim().min(1, message);
const url = (message: string) => z.string().trim().regex(HTTP_URL, message);

const schema = z.object({
  workshopAddress: text("La dirección del taller es obligatoria."),
  workshopMapsUrl: url("Ingresa un enlace que empiece por http:// o https:// y no tenga espacios."),
  chrysalisWarrantyDays: z.preprocess(
    (v) => (typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : typeof v === "number" ? v : Number.NaN),
    z.number().int("Ingresa un número entero de días.").positive("Los días de garantía deben ser mayores que 0."),
  ),
  termsUrl: url("Ingresa un enlace que empiece por http:// o https:// y no tenga espacios."),
  instagramUrl: url("Ingresa un enlace que empiece por http:// o https:// y no tenga espacios."),
  facebookLabel: text("El texto de Facebook es obligatorio."),
  facebookUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    url("Ingresa un enlace que empiece por http:// o https:// y no tenga espacios.").optional(),
  ),
  website: z
    .string()
    .trim()
    .min(1, "El sitio web es obligatorio.")
    .regex(/^\S+$/, "El sitio web no puede tener espacios."),
  deliveryRouteDepartureText: text("La salida de la ruta es obligatoria."),
});

export function parseBusinessSettingsInput(
  raw: unknown,
): { ok: true; data: BusinessSettingsInput } | { ok: false; errors: Partial<Record<BusinessSettingsField, string>> } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: {} };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Partial<Record<BusinessSettingsField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as BusinessSettingsField | undefined;
      if (key && !(key in errors)) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  const d = parsed.data;
  return { ok: true, data: { ...d, facebookUrl: d.facebookUrl ?? null } };
}

export function toBusinessSettingsUpdate(input: BusinessSettingsInput, actor: string): BusinessSettingsUpdate {
  return {
    workshop_address: input.workshopAddress,
    workshop_maps_url: input.workshopMapsUrl,
    chrysalis_warranty_days: input.chrysalisWarrantyDays,
    terms_url: input.termsUrl,
    instagram_url: input.instagramUrl,
    facebook_label: input.facebookLabel,
    facebook_url: input.facebookUrl,
    website: input.website,
    delivery_route_departure_text: input.deliveryRouteDepartureText,
    updated_by: actor,
  };
}

const CONSTRAINT_FIELD: Record<string, BusinessSettingsField> = {
  business_settings_workshop_address_check: "workshopAddress",
  business_settings_workshop_maps_url_check: "workshopMapsUrl",
  business_settings_warranty_days_check: "chrysalisWarrantyDays",
  business_settings_terms_url_check: "termsUrl",
  business_settings_instagram_url_check: "instagramUrl",
  business_settings_facebook_label_check: "facebookLabel",
  business_settings_facebook_url_check: "facebookUrl",
  business_settings_website_check: "website",
  business_settings_delivery_route_departure_text_check: "deliveryRouteDepartureText",
};

export const PERMISSION_DENIED_MESSAGE =
  "No se pudo guardar: la base de datos no otorga el permiso necesario. Avisa al equipo técnico.";

/** Fallback mapping of a database error to a field message (the form validates first). */
export function mapBusinessSettingsDbError(error: { code?: string; message: string }): {
  field?: BusinessSettingsField;
  error: string;
} {
  if (error.code === "42501") return { error: PERMISSION_DENIED_MESSAGE };
  const name = /constraint "([^"]+)"/.exec(error.message)?.[1];
  const field = name ? CONSTRAINT_FIELD[name] : undefined;
  if (field) return { field, error: "El valor no cumple el formato esperado. Revísalo." };
  return { error: "No se pudo guardar los cambios. Inténtalo de nuevo." };
}

/** "Última actualización" in America/Bogota; empty string for an invalid timestamp. */
export function formatSettingsUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
