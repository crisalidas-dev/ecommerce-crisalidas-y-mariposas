import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { getBusinessSettings } from "@/lib/data/business-settings";
import { parseOrderView, type ParsedOrderView } from "@/lib/domain/checkout/orderView";
import type { ReceiptBusiness } from "@/lib/domain/checkout/receipt";

/**
 * Reads for the public order page and its PDF receipt (slice 6). Read-only,
 * service-role, explicit columns (README ADR-0008).
 *
 * Deliberately absent: `sale_details` (buyer, recipient, address, invoice
 * data), the `chat_id` is read only to check it is a web order and never leaves
 * the domain parser. The order id is the bearer token of the link.
 */

const ORDER_COLUMNS =
  "id, chat_id, status, payment_status, payment_ref, paid_amount, confirmed_at, human_number, total_price, delivery_fee, grand_total, delivery_method, desired_delivery_date, created_at";

const RESERVATION_COLUMNS =
  "id, status, qty, unit_price, total_price, options, expires_at, created_at, product_variants(attributes, products(name))";

/** Loads the order and ALL its reservations and maps them to the view. Throws on a transport error. */
export async function loadOrderView(orderId: string, now: Date): Promise<ParsedOrderView> {
  const supabase = createAdminClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .like("chat_id", "web:%")
    .maybeSingle();
  if (error) throw new Error(`load order view failed: ${error.code ?? "unknown"}`);
  if (!order) return { kind: "not_found" };

  const { data: reservations, error: linesError } = await supabase
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("order_id", orderId);
  if (linesError) throw new Error(`load order view lines failed: ${linesError.code ?? "unknown"}`);

  return parseOrderView({ order, reservations: reservations ?? [] }, now);
}

/**
 * Public business details for the receipt header. Best effort: the settings
 * row may be missing or unreadable, and the receipt must still be issued.
 */
export async function loadReceiptBusiness(): Promise<ReceiptBusiness | null> {
  try {
    const settings = await getBusinessSettings();
    if (!settings) return null;
    return { address: settings.workshop_address ?? null, website: settings.website ?? null };
  } catch (error) {
    console.error("loadReceiptBusiness failed", error);
    return null;
  }
}
