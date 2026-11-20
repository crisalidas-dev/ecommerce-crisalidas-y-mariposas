import { z } from "zod";

/**
 * Pure validation and mapping for `public.payment_info` (single row, id = 1).
 * Column names are Spanish and fixed: other consumers (the WhatsApp agent)
 * read this table. `qr_url` is not part of the text form: the QR upload owns it.
 */

export const PAYMENT_INFO_FIELDS = ["banco", "tipoCuenta", "numero", "titular", "nit", "llave"] as const;

export type PaymentInfoField = (typeof PAYMENT_INFO_FIELDS)[number];

export interface PaymentInfoInput {
  banco: string;
  tipoCuenta: string;
  numero: string;
  titular: string;
  nit: string | null;
  llave: string | null;
}

/** Row as read from the table (as stored). */
export interface PaymentInfo {
  banco: string;
  tipo_cuenta: string;
  numero: string;
  titular: string;
  nit: string | null;
  llave: string | null;
  qr_url: string | null;
}

/** Columns the text form writes: never `id` nor `qr_url`. */
export interface PaymentInfoUpdate {
  banco: string;
  tipo_cuenta: string;
  numero: string;
  titular: string;
  nit: string | null;
  llave: string | null;
}

const required = (message: string) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().min(1, message));
const optional = z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string()).transform((v) => (v === "" ? null : v));

const schema = z.object({
  banco: required("El banco es obligatorio."),
  tipoCuenta: required("El tipo de cuenta es obligatorio."),
  numero: required("El número de cuenta es obligatorio."),
  titular: required("El titular es obligatorio."),
  nit: optional,
  llave: optional,
});

export function parsePaymentInfoInput(
  raw: unknown,
): { ok: true; data: PaymentInfoInput } | { ok: false; errors: Partial<Record<PaymentInfoField, string>> } {
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: {} };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Partial<Record<PaymentInfoField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as PaymentInfoField | undefined;
      if (key && !(key in errors)) errors[key] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, data: parsed.data };
}

export function toPaymentInfoUpdate(input: PaymentInfoInput): PaymentInfoUpdate {
  return {
    banco: input.banco,
    tipo_cuenta: input.tipoCuenta,
    numero: input.numero,
    titular: input.titular,
    nit: input.nit,
    llave: input.llave,
  };
}

export const PAYMENT_INFO_PERMISSION_DENIED =
  "No se pudo guardar: la base de datos no otorga el permiso necesario. Avisa al equipo técnico.";

export function mapPaymentInfoDbError(error: { code?: string; message: string }): { error: string } {
  if (error.code === "42501") return { error: PAYMENT_INFO_PERMISSION_DENIED };
  return { error: "No se pudo guardar los cambios. Inténtalo de nuevo." };
}
