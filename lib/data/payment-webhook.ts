import "server-only";
import type { ConfirmOrderInput, PaymentIncidentInput } from "@/lib/domain/checkout/handlePaymentWebhook";
import type { MpPaymentStatus } from "@/lib/domain/checkout/paymentDecision";
import { createAdminClient } from "@/lib/supabase/admin-client";

/**
 * RPC adapters of the store's Mercado Pago webhook (slice 7). All three are
 * granted to `service_role` only, hence the admin client, server-side.
 *
 * Each returns the raw jsonb: reading it is the use case's job
 * (`handlePaymentWebhook`). A transport error throws, and the use case answers
 * 500 so Mercado Pago retries the notification.
 */

/**
 * `confirm_order(p_order, p_source, p_payment_ref, p_paid_amount)`: the ONLY
 * writer of a paid order. Idempotent by `p_payment_ref` (the payment id).
 */
export async function callConfirmOrder(input: ConfirmOrderInput): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("confirm_order", {
    p_order: input.orderId,
    p_source: input.source,
    p_payment_ref: input.paymentRef,
    p_paid_amount: input.paidAmount,
  });
  if (error) throw new Error(`confirm_order failed: ${error.code ?? "unknown"}`);
  return data;
}

/** `set_payment_status(p_order, p_status)`: only `rechazado` / `en_proceso`, only on open orders. */
export async function callSetPaymentStatus(orderId: string, status: MpPaymentStatus): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("set_payment_status", { p_order: orderId, p_status: status });
  if (error) throw new Error(`set_payment_status failed: ${error.code ?? "unknown"}`);
  return data;
}

/**
 * `record_payment_incident(...)` (spec 038): an approved payment that
 * `confirm_order` refused. Idempotent by `mp_payment_id`; never touches
 * orders or stock. `p_refusal` is `confirm_order`'s answer verbatim.
 */
export async function callRecordPaymentIncident(input: PaymentIncidentInput): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_payment_incident", {
    p_mp_payment_id: input.mpPaymentId,
    p_channel: input.channel,
    p_order: input.orderId,
    p_amount: input.amount,
    p_mp_status: input.mpStatus,
    p_refusal: input.refusal,
    p_mp_external_reference: input.externalReference,
  });
  if (error) throw new Error(`record_payment_incident failed: ${error.code ?? "unknown"}`);
  return data;
}
