import "server-only";
import type { CreateWebOrderPayload } from "@/lib/domain/checkout/webOrderPayload";
import type { PaymentLinkToSave } from "@/lib/domain/checkout/startPayment";
import { createAdminClient } from "@/lib/supabase/admin-client";

/**
 * `create_web_order(p_payload jsonb)`: creates the open web order, its stock
 * reservations (60 min) and the customer details in one transaction. The RPC is
 * granted to `service_role` only, hence the admin client, server-side.
 *
 * Returns the raw jsonb: reading it is the domain's job
 * (`parseCreateWebOrderResult`). A transport error throws, and the use case
 * turns it into a "try again" route.
 */
export async function callCreateWebOrder(payload: CreateWebOrderPayload): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("create_web_order", { p_payload: payload });
  if (error) throw new Error(`create_web_order failed: ${error.code ?? "unknown"}`);
  return data;
}

/**
 * Re-reads a web order for charging: the order row and its ACTIVE reservations
 * (the lines), with explicit columns. Returns the raw rows; reading them is the
 * domain's job (`parsePaymentOrder`). `order: null` when the id does not exist.
 */
export async function loadPaymentOrder(orderId: string): Promise<unknown> {
  const supabase = createAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, chat_id, status, payment_status, human_number, total_price, delivery_fee, grand_total, init_point, payment_expires_at",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(`load payment order failed: ${error.code ?? "unknown"}`);
  if (!order) return { order: null, reservations: [] };

  const { data: reservations, error: linesError } = await supabase
    .from("reservations")
    .select(
      "id, qty, unit_price, total_price, options, expires_at, created_at, product_variants(sku, attributes, products(name))",
    )
    .eq("order_id", orderId)
    .eq("status", "activa");
  if (linesError) throw new Error(`load payment lines failed: ${linesError.code ?? "unknown"}`);
  return { order, reservations: reservations ?? [] };
}

/**
 * `set_payment_link`: stores the preference on the open order. The database
 * re-checks that the order is open, has active lines and delivery, that the
 * link is HTTPS and that it expires in the future without outliving the hold.
 * Returns the raw jsonb (`{ ok: true }` or `{ ok: false, error }`).
 */
export async function callSetPaymentLink(link: PaymentLinkToSave): Promise<unknown> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("set_payment_link", {
    p_order: link.orderId,
    p_preference_id: link.preferenceId,
    p_init_point: link.initPoint,
    p_expires_at: link.expiresAt,
  });
  if (error) throw new Error(`set_payment_link failed: ${error.code ?? "unknown"}`);
  return data;
}
