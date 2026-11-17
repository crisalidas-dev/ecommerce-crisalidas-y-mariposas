import { z } from "zod";
import {
  MIN_TIME_TO_PAY_MS,
  buildPreference,
  type CheckoutPreference,
  type PayableLine,
  type PayableOption,
  type PayableOrder,
} from "./mercadoPagoPreference.ts";

/**
 * Server use case behind `startPaymentAction` (slice 5): turn an open web order
 * into a Mercado Pago Checkout Pro link.
 *
 * Input is untrusted (a public POST) and carries ids only. The order, its lines
 * and its amounts are RE-READ from the database; nothing the browser says about
 * prices is used. A still-valid stored link is reused instead of creating a new
 * preference. Nothing here marks an order as paid: that is `confirm_order`,
 * called by the store webhook after verifying the payment (README ADR-0010).
 *
 * Database and Mercado Pago are injected, so tests use fakes.
 */

// ---- Ports -----------------------------------------------------------------------

export type CreatePreferenceOutcome =
  | { ok: true; preferenceId: string; initPoint: string }
  | {
      ok: false;
      /**
       * not_configured: MP_ACCESS_TOKEN missing. unavailable: network, timeout
       * or 5xx. rejected: Mercado Pago refused the payload (4xx) or answered
       * something unreadable.
       */
      error: "not_configured" | "unavailable" | "rejected";
    };

export interface PaymentLinkToSave {
  orderId: string;
  preferenceId: string;
  initPoint: string;
  /** ISO with offset; the same instant sent as `expiration_date_to`. */
  expiresAt: string;
}

export interface StartPaymentDeps {
  /** Raw `{ order, reservations }` rows for the order id (`order: null` if none). */
  loadOrder: (orderId: string) => Promise<unknown>;
  createPreference: (preference: CheckoutPreference, idempotencyKey: string) => Promise<CreatePreferenceOutcome>;
  /** Calls `set_payment_link` and returns its raw jsonb. */
  savePaymentLink: (link: PaymentLinkToSave) => Promise<unknown>;
  siteUrl: string | undefined;
  now: () => Date;
}

// ---- Result ----------------------------------------------------------------------

export type PaymentRoute =
  /** The order can no longer be charged (expired, closed, unknown): reserve again with a new attempt. */
  | { kind: "intento"; message: string }
  /** A payment is already in process (PSE pending, transfer proof under review): do not start another. */
  | { kind: "en_proceso"; message: string }
  /** The order is already paid. */
  | { kind: "pagado"; message: string }
  /** Nothing is wrong with the order: try again later (network, Mercado Pago, configuration). */
  | { kind: "retry"; message: string };

export type StartPaymentResult =
  | { ok: true; initPoint: string; reused: boolean }
  | { ok: false; route: PaymentRoute };

const fail = (route: PaymentRoute): StartPaymentResult => ({ ok: false, route });

const RESERVE_AGAIN: PaymentRoute = {
  kind: "intento",
  message: "El tiempo de tu reserva terminó. Volvemos a reservar tus productos para que puedas pagar.",
};
const RESTART: PaymentRoute = { kind: "intento", message: "Reiniciamos tu pedido para continuar." };
const IN_PROCESS: PaymentRoute = {
  kind: "en_proceso",
  message:
    "Ya hay un pago en proceso para este pedido. Espera la confirmación de tu banco o de Mercado Pago antes de intentarlo de nuevo.",
};
const PAID: PaymentRoute = { kind: "pagado", message: "Este pedido ya está pagado. ¡Gracias por tu compra!" };
const MP_DOWN: PaymentRoute = {
  kind: "retry",
  message: "No pudimos conectar con Mercado Pago. Tu pedido sigue separado; inténtalo de nuevo en unos minutos.",
};
const NOT_AVAILABLE: PaymentRoute = {
  kind: "retry",
  message: "El pago en línea no está disponible en este momento. Tu pedido sigue separado; inténtalo más tarde.",
};
const UNAVAILABLE: PaymentRoute = {
  kind: "retry",
  message: "No pudimos preparar tu pago en este momento. Tu pedido sigue separado; inténtalo de nuevo en unos minutos.",
};

// ---- Parsing the rows ------------------------------------------------------------

/** Integer COP from a JSON number or a numeric string ("200000.00"). Fractions are refused. */
export const cop = z
  .union([z.number(), z.string().regex(/^\d+(\.0+)?$/).transform(Number)])
  .refine((n) => Number.isSafeInteger(n) && n >= 0);

const instant = z.string().refine((v) => !Number.isNaN(Date.parse(v)));

const orderRowSchema = z.object({
  id: z.uuid(),
  chat_id: z.string(),
  status: z.string(),
  payment_status: z.string().nullable(),
  human_number: z.string().min(1),
  total_price: cop,
  delivery_fee: cop.nullable(),
  grand_total: cop,
  init_point: z.string().nullable(),
  payment_expires_at: instant.nullable(),
});

const reservationRowSchema = z.object({
  id: z.string(),
  qty: z.number().int().positive(),
  unit_price: cop,
  total_price: cop,
  options: z.unknown(),
  expires_at: instant,
  created_at: z.string(),
  product_variants: z.object({
    sku: z.string().min(1),
    attributes: z.unknown(),
    products: z.object({ name: z.string().min(1) }),
  }),
});

const optionSchema = z.object({ nombre: z.string().min(1), precio: cop, qty: z.number().int().positive() });

export interface PaymentOrder {
  chatId: string;
  status: string;
  paymentStatus: string | null;
  storedLink: { initPoint: string; expiresAt: string } | null;
  payable: PayableOrder;
}

export type ParsedPaymentOrder =
  | { kind: "ok"; order: PaymentOrder }
  | { kind: "missing" }
  | { kind: "malformed" };

/** Option names are only shown in the item title: an unreadable entry is skipped, not fatal. */
export function readOptions(raw: unknown): PayableOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PayableOption[] = [];
  for (const entry of raw) {
    const o = optionSchema.safeParse(entry);
    if (o.success) out.push({ name: o.data.nombre, qty: o.data.qty, unitPrice: o.data.precio });
  }
  return out;
}

export function readLabel(attributes: unknown): string {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return "";
  return Object.values(attributes)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim())
    .join(", ");
}

/**
 * Reads `{ order, reservations }` as the adapter fetched them. `reservations`
 * must already be the ACTIVE ones (`status = 'activa'`). Lines keep creation
 * order; the hold ends with the earliest reservation, like `_web_order_result`.
 */
export function parsePaymentOrder(raw: unknown): ParsedPaymentOrder {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { kind: "malformed" };
  const body = raw as Record<string, unknown>;
  if (body.order === null || body.order === undefined) return { kind: "missing" };

  const order = orderRowSchema.safeParse(body.order);
  const reservations = z.array(reservationRowSchema).safeParse(body.reservations ?? []);
  if (!order.success || !reservations.success) return { kind: "malformed" };

  const rows = [...reservations.data].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
  const lines: PayableLine[] = rows.map((r) => ({
    variantSku: r.product_variants.sku,
    productName: r.product_variants.products.name,
    variantLabel: readLabel(r.product_variants.attributes),
    qty: r.qty,
    unitPrice: r.unit_price,
    totalPrice: r.total_price,
    options: readOptions(r.options),
  }));
  const ends = rows.map((r) => Date.parse(r.expires_at));
  const o = order.data;

  return {
    kind: "ok",
    order: {
      chatId: o.chat_id,
      status: o.status,
      paymentStatus: o.payment_status,
      storedLink:
        o.init_point && o.payment_expires_at ? { initPoint: o.init_point, expiresAt: o.payment_expires_at } : null,
      payable: {
        orderId: o.id,
        humanNumber: o.human_number,
        subtotal: o.total_price,
        deliveryFee: o.delivery_fee ?? 0,
        grandTotal: o.grand_total,
        reservationExpiresAt: ends.length > 0 ? new Date(Math.min(...ends)).toISOString() : "",
        lines,
      },
    },
  };
}

// ---- Use case --------------------------------------------------------------------

const inputSchema = z.object({ orderId: z.uuid(), attemptId: z.uuid() });

/** `payment_status` values from which a (new) payment may start. */
const PAYABLE_STATUSES: readonly (string | null)[] = [null, "pendiente", "rechazado"];
const IN_PROCESS_STATUSES: readonly string[] = ["en_proceso", "comprobante_recibido"];

/** `set_payment_link` errors after which the order cannot be charged as it is. */
const CLOSED_LINK_ERRORS: readonly string[] = [
  "PEDIDO_NO_EXISTE",
  "PEDIDO_NO_ABIERTO",
  "PEDIDO_SIN_LINEAS",
  "ENTREGA_NO_DEFINIDA",
  "ENLACE_INVALIDO",
];

export async function startPayment(raw: unknown, deps: StartPaymentDeps): Promise<StartPaymentResult> {
  const input = inputSchema.safeParse(raw);
  if (!input.success) return fail(RESTART);
  const { orderId, attemptId } = input.data;

  // 1. Re-read the order server-side.
  let rows: unknown;
  try {
    rows = await deps.loadOrder(orderId);
  } catch {
    return fail(UNAVAILABLE);
  }
  const parsed = parsePaymentOrder(rows);
  if (parsed.kind === "missing") return fail(RESTART);
  if (parsed.kind === "malformed") return fail(UNAVAILABLE);
  const order = parsed.order;

  // 2. It must be this attempt's web order. Same answer as "missing": no hint.
  if (order.chatId.toLowerCase() !== `web:${attemptId}`.toLowerCase()) return fail(RESTART);

  // 3. Order and payment state.
  if (order.status === "pagado") return fail(PAID);
  if (order.status !== "abierto") return fail(RESERVE_AGAIN);
  if (order.paymentStatus !== null && IN_PROCESS_STATUSES.includes(order.paymentStatus)) return fail(IN_PROCESS);
  if (!PAYABLE_STATUSES.includes(order.paymentStatus)) return fail(UNAVAILABLE);

  // TODO(decisión): cash (Efecty) stays excluded from the preference because a
  // 60-minute hold cannot wait days for a voucher (nacer-pagos §4, ADR-0010).
  // Enabling it needs a reservation policy decision first; do not add it here.

  // 4. The hold must still be running. The order may still say `abierto`
  //    because `expire_reservations` has no scheduler.
  const now = deps.now();
  const holdEnd = Date.parse(order.payable.reservationExpiresAt);
  if (order.payable.lines.length === 0 || Number.isNaN(holdEnd) || holdEnd <= now.getTime()) {
    return fail(RESERVE_AGAIN);
  }

  // 5. Reuse a stored link with time left. `set_delivery` and `reserve_variant`
  //    clear it whenever the amount changes, so a stored link matches the order.
  const stored = order.storedLink;
  if (
    stored !== null &&
    stored.initPoint.startsWith("https://") &&
    Date.parse(stored.expiresAt) - now.getTime() >= MIN_TIME_TO_PAY_MS
  ) {
    return { ok: true, initPoint: stored.initPoint, reused: true };
  }

  // 6. Build from the server order.
  const built = buildPreference(order.payable, { siteUrl: deps.siteUrl, now });
  if (!built.ok) {
    switch (built.error) {
      case "expired":
      case "no_lines":
        return fail(RESERVE_AGAIN);
      case "invalid_site_url":
        console.error("startPayment: SITE_URL is missing or not HTTPS");
        return fail(NOT_AVAILABLE);
      case "invalid_amount":
      case "total_mismatch":
        // TODO(decisión): alert the operator (channel pending, README ADR-0010).
        console.error(`startPayment: order ${orderId} not chargeable (${built.error})`);
        return fail(UNAVAILABLE);
    }
  }

  // 7. Create the preference.
  let created: CreatePreferenceOutcome;
  try {
    created = await deps.createPreference(built.preference, built.idempotencyKey);
  } catch {
    return fail(MP_DOWN);
  }
  if (!created.ok) return fail(created.error === "not_configured" ? NOT_AVAILABLE : MP_DOWN);

  // 8. Store it. A link the database refused is never handed out: the order may
  //    have closed meanwhile, and paying a closed order charges money without a sale.
  let saved: unknown;
  try {
    saved = await deps.savePaymentLink({
      orderId,
      preferenceId: created.preferenceId,
      initPoint: created.initPoint,
      expiresAt: built.linkExpiresAt,
    });
  } catch {
    return fail(UNAVAILABLE);
  }
  const answer = typeof saved === "object" && saved !== null ? (saved as Record<string, unknown>) : {};
  if (answer.ok === true) return { ok: true, initPoint: created.initPoint, reused: false };
  if (typeof answer.error === "string" && CLOSED_LINK_ERRORS.includes(answer.error)) return fail(RESERVE_AGAIN);
  return fail(UNAVAILABLE);
}
