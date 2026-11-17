/**
 * Mercado Pago Checkout Pro preference for a web order (slice 5). Pure: no
 * network, no env, no clock of its own.
 *
 * Built ONLY from the order as the server re-read it from the database, never
 * from client values. It refuses to build (typed error) rather than send a
 * preference whose items do not add up to the order's grand total: charging a
 * different amount would make `confirm_order` reject the payment with
 * `MONTO_NO_COINCIDE` after the customer already paid.
 *
 * Creating a preference never marks anything as paid. Only the store webhook
 * (slice 7), after verifying the payment against the Mercado Pago API, calls
 * `confirm_order` (README ADR-0010).
 */

/** The store's own webhook route (slice 7 implements the handler). */
export const MERCADOPAGO_WEBHOOK_PATH = "/api/webhooks/mercadopago";

/**
 * Public order page that Mercado Pago returns the buyer to (slice 6 builds it).
 * The order UUID is random and unguessable; Mercado Pago also appends it to the
 * return URL as `external_reference`. The page only READS the payment state.
 */
export function orderPagePath(orderId: string): string {
  return `/pedido/${encodeURIComponent(orderId)}`;
}

/**
 * Payment types removed from the preference, so only cards and PSE remain
 * (README ADR-0010: cash takes days and cannot live with a 60-minute hold).
 * Verified against Mercado Pago's "Available payment methods" table
 * (mercadopago.com.co/developers/es/docs/sales-processing/payment-methods):
 *  - `ticket`: Efecty in Colombia (cash voucher). Excluded.
 *  - `atm`: not offered in Colombia today; excluded anyway so a future
 *    offline method of that type can never slip in.
 *  - kept: `credit_card`, `debit_card`, `prepaid_card`, `bank_transfer` (PSE).
 *  - `account_money` (Mercado Pago balance) cannot be excluded in Checkout Pro
 *    and settles immediately, so it is harmless.
 */
export const EXCLUDED_PAYMENT_TYPES = ["ticket", "atm"] as const;

export const STATEMENT_DESCRIPTOR = "NACER GROUP";

/** The payment link dies this long before the stock hold, never after it. */
export const LINK_MARGIN_MS = 60_000;
/** Below this much time left on the link there is no point sending the buyer to pay. */
export const MIN_TIME_TO_PAY_MS = 2 * 60_000;

const TITLE_MAX = 256;
const DELIVERY_ITEM_ID = "ENVIO";

export interface PayableOption {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface PayableLine {
  variantSku: string;
  productName: string;
  /** Variant attributes as shown to the buyer ("Azul"), or "". */
  variantLabel: string;
  qty: number;
  unitPrice: number;
  /** What the database charges for the line, options included. Integer COP. */
  totalPrice: number;
  options: PayableOption[];
}

/** The order as the server re-read it. All money in integer COP. */
export interface PayableOrder {
  orderId: string;
  /** Business code shown to the buyer (e.g. `C0002`). */
  humanNumber: string;
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  /** ISO instant when the first active reservation ends. */
  reservationExpiresAt: string;
  lines: PayableLine[];
}

export interface PreferenceItem {
  id: string;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: "COP";
}

export interface CheckoutPreference {
  items: PreferenceItem[];
  external_reference: string;
  metadata: { source: "web"; order_id: string };
  notification_url: string;
  back_urls: { success: string; pending: string; failure: string };
  auto_return: "approved";
  payment_methods: { excluded_payment_types: { id: (typeof EXCLUDED_PAYMENT_TYPES)[number] }[] };
  statement_descriptor: string;
  expires: true;
  expiration_date_to: string;
}

export type PreferenceBuildError =
  | "invalid_site_url"
  | "no_lines"
  | "invalid_amount"
  | "total_mismatch"
  | "expired";

export type BuildPreferenceResult =
  | {
      ok: true;
      preference: CheckoutPreference;
      /** Same instant as `expiration_date_to`; stored with `set_payment_link`. */
      linkExpiresAt: string;
      /** `X-Idempotency-Key`: a retry of the same order and link returns the same preference. */
      idempotencyKey: string;
    }
  | { ok: false; error: PreferenceBuildError };

export interface BuildPreferenceConfig {
  /** `SITE_URL`: absolute HTTPS origin of the store. */
  siteUrl: string | undefined;
  now: Date;
}

const isCop = (n: number) => Number.isSafeInteger(n) && n >= 0;
const isPositiveCop = (n: number) => Number.isSafeInteger(n) && n > 0;

/** HTTPS origin without a trailing slash, or null. Mercado Pago requires HTTPS for `notification_url`. */
function httpsOrigin(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null;
  let url: URL;
  try {
    url = new URL(siteUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

const BOGOTA_OFFSET_MS = -5 * 60 * 60_000;

/**
 * ISO 8601 in America/Bogota wall time with its offset (`-05:00`). Colombia has
 * no daylight saving time, so the offset is fixed.
 */
export function formatBogotaIso(date: Date): string {
  const shifted = new Date(date.getTime() + BOGOTA_OFFSET_MS).toISOString();
  return `${shifted.slice(0, -1)}-05:00`;
}

function clip(title: string): string {
  return title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX - 1)}…`;
}

function lineItem(order: PayableOrder, line: PayableLine): PreferenceItem {
  const name = line.variantLabel ? `${line.productName} (${line.variantLabel})` : line.productName;
  const options = line.options.map((o) => ` + ${o.name} ×${o.qty}`).join("");
  const perUnit = line.totalPrice / line.qty;
  // The database line total is authoritative. When it splits evenly per unit
  // (options are per unit of the variant) the item keeps the real quantity;
  // otherwise the line is charged as one item so the sum stays exact.
  if (Number.isSafeInteger(perUnit)) {
    return {
      id: line.variantSku,
      title: clip(`${order.humanNumber} · ${name}${options}`),
      quantity: line.qty,
      unit_price: perUnit,
      currency_id: "COP",
    };
  }
  return {
    id: line.variantSku,
    title: clip(`${order.humanNumber} · ${line.qty} × ${name}${options}`),
    quantity: 1,
    unit_price: line.totalPrice,
    currency_id: "COP",
  };
}

export function buildPreference(order: PayableOrder, config: BuildPreferenceConfig): BuildPreferenceResult {
  const origin = httpsOrigin(config.siteUrl);
  if (origin === null) return { ok: false, error: "invalid_site_url" };

  if (order.lines.length === 0) return { ok: false, error: "no_lines" };

  // Money: integer COP only, nothing negative, nothing free.
  if (!isPositiveCop(order.grandTotal) || !isCop(order.subtotal) || !isCop(order.deliveryFee)) {
    return { ok: false, error: "invalid_amount" };
  }
  for (const line of order.lines) {
    const unitsOk = Number.isSafeInteger(line.qty) && line.qty > 0;
    const pricesOk = isPositiveCop(line.unitPrice) && isPositiveCop(line.totalPrice);
    const optionsOk = line.options.every((o) => isCop(o.unitPrice) && Number.isSafeInteger(o.qty) && o.qty > 0);
    if (!unitsOk || !pricesOk || !optionsOk || line.totalPrice < line.qty * line.unitPrice) {
      return { ok: false, error: "invalid_amount" };
    }
  }

  // Expiry: the link must die before the reservation does.
  const reservationEnd = Date.parse(order.reservationExpiresAt);
  if (Number.isNaN(reservationEnd)) return { ok: false, error: "expired" };
  const linkEnd = new Date(reservationEnd - LINK_MARGIN_MS);
  if (linkEnd.getTime() - config.now.getTime() < MIN_TIME_TO_PAY_MS) return { ok: false, error: "expired" };

  const items = order.lines.map((line) => lineItem(order, line));
  if (order.deliveryFee > 0) {
    items.push({
      id: DELIVERY_ITEM_ID,
      title: `${order.humanNumber} · Domicilio`,
      quantity: 1,
      unit_price: order.deliveryFee,
      currency_id: "COP",
    });
  }

  const linesTotal = order.lines.reduce((sum, l) => sum + l.totalPrice, 0);
  const itemsTotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  if (
    linesTotal !== order.subtotal ||
    order.subtotal + order.deliveryFee !== order.grandTotal ||
    itemsTotal !== order.grandTotal
  ) {
    return { ok: false, error: "total_mismatch" };
  }

  const linkExpiresAt = formatBogotaIso(linkEnd);
  const orderPage = `${origin}${orderPagePath(order.orderId)}`;

  return {
    ok: true,
    preference: {
      items,
      external_reference: order.orderId,
      metadata: { source: "web", order_id: order.orderId },
      notification_url: `${origin}${MERCADOPAGO_WEBHOOK_PATH}`,
      back_urls: { success: orderPage, pending: orderPage, failure: orderPage },
      auto_return: "approved",
      payment_methods: { excluded_payment_types: EXCLUDED_PAYMENT_TYPES.map((id) => ({ id })) },
      statement_descriptor: STATEMENT_DESCRIPTOR,
      expires: true,
      expiration_date_to: linkExpiresAt,
    },
    linkExpiresAt,
    idempotencyKey: `web-${order.orderId}-${order.grandTotal}-${Math.floor(linkEnd.getTime() / 1000)}`,
  };
}

/** What `POST /checkout/preferences` answered, reduced to what the store keeps. */
export type ParsedPreferenceResponse = { ok: true; preferenceId: string; initPoint: string } | { ok: false };

export function parsePreferenceResponse(raw: unknown): ParsedPreferenceResponse {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false };
  const body = raw as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const initPoint = typeof body.init_point === "string" ? body.init_point.trim() : "";
  if (!id || !initPoint.startsWith("https://")) return { ok: false };
  return { ok: true, preferenceId: id, initPoint };
}
