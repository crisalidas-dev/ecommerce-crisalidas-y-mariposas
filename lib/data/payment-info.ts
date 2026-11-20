import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { PaymentInfo, PaymentInfoUpdate } from "@/lib/domain/paymentInfo";
import type { DbError } from "./business-settings";

/**
 * Data access for `payment_info` (single row, `CHECK (id = 1)`). RLS is on with
 * no policies: only service_role reads/writes, so every call goes through
 * `createAdminClient()`. Writes are an UPDATE of id = 1; never insert/upsert.
 */

const COLUMNS = "banco, tipo_cuenta, numero, titular, nit, llave, qr_url";

export async function getPaymentInfo(): Promise<PaymentInfo | null> {
  const { data, error } = await createAdminClient().from("payment_info").select(COLUMNS).eq("id", 1).maybeSingle();
  if (error) throw error;
  return (data as PaymentInfo | null) ?? null;
}

/** Returns the error, or null on success. Fails (no row) when the row is missing. */
export async function updatePaymentInfo(update: PaymentInfoUpdate): Promise<DbError | null> {
  const { data, error } = await createAdminClient().from("payment_info").update(update).eq("id", 1).select("id");
  if (error) return error;
  if (!data || data.length === 0) return { message: "payment_info row not found" };
  return null;
}

export async function updatePaymentQrUrl(qrUrl: string): Promise<DbError | null> {
  const { data, error } = await createAdminClient().from("payment_info").update({ qr_url: qrUrl }).eq("id", 1).select("id");
  if (error) return error;
  if (!data || data.length === 0) return { message: "payment_info row not found" };
  return null;
}
