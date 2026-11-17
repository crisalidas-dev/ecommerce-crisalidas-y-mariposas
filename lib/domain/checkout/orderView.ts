import { z } from "zod";
import { cop, readLabel, readOptions } from "./startPayment.ts";

/**
 * View model of the public order page and its PDF receipt (slice 6). Pure: no
 * network, no clock of its own.
 *
 * The page only READS the payment state. Whether an order is paid is decided
 * by the database (`confirm_order` leaves `status = 'pagado'`); nothing here
 * looks at Mercado Pago's return parameters (README ADR-0010).
 *
 * The URL is a bearer link (the order UUID), so the view carries NO personal
 * data: no buyer, recipient, phone, email, address, invoice data or chat id.
 * Delivery shows only the method and the date. `sale_details` is never read.
 *
 * Mapping rows -> `paymentState` (first match wins):
 *
 *   payment_status = reembolsado                     -> refunded
 *   status = pagado                                  -> paid
 *   status = vencido | cancelado                     -> expired
 *   status = abierto:
 *     payment_status = en_proceso | comprobante_recibido
 *                      | aprobado (confirm_order not applied yet) -> processing
 *     no live ('activa') line                        -> expired
 *     payment_status = rechazado                     -> rejected   (or expired if the hold ended)
 *     payment_status = pendiente | null              -> pending    (or expired if the hold ended)
 *
 * A payment in flight is never shown as expired just because the clock passed
 * the hold: PSE may still settle and `confirm_order` decides.
 */

export type PaymentState = "paid" | "pending" | "processing" | "rejected" | "expired" | "refunded";

export interface OrderViewOption {
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrderViewLine {
  productName: string;
  /** Variant attributes as shown to the buyer ("Azul"), or "". */
  variantLabel: string;
  qty: number;
  /** Per unit, options included. Integer COP. */
  unitPrice: number;
  totalPrice: number;
  options: OrderViewOption[];
}

export interface OrderPaymentInfo {
  /** Mercado Pago payment id, once confirmed. */
  reference: string | null;
  confirmedAtLabel: string | null;
  /** What was charged (`paid_amount`). Integer COP. */
  paidAmount: number;
}

export interface OrderView {
  orderId: string;
  /** Business code shown to the buyer (e.g. `C0002`). */
  humanNumber: string;
  createdAtLabel: string;
  paymentState: PaymentState;
  lines: OrderViewLine[];
  subtotal: number;
  deliveryFee: number;
  grandTotal: number;
  delivery: { method: "tienda" | "domicilio" | null; dateLabel: string | null };
  /** Only when `paymentState` is `paid`. */
  payment: OrderPaymentInfo | null;
}

export type ParsedOrderView =
  /** Missing, not a web order: the page answers 404 for both. */
  | { kind: "not_found" }
  /** Rows that do not look like what the database promises. */
  | { kind: "malformed" }
  /** Readable rows that contradict each other (totals, paid without lines...). */
  | { kind: "inconsistent" }
  | { kind: "ok"; view: OrderView };

// ---- Id --------------------------------------------------------------------------

const orderIdSchema = z.uuid();

/** The order id is the bearer token: anything that is not a UUID never reaches the database. */
export function isOrderId(value: string): boolean {
  return orderIdSchema.safeParse(value).success;
}

// ---- Bogota dates ----------------------------------------------------------------

const BOGOTA_OFFSET_MS = -5 * 60 * 60_000;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * "17 de noviembre de 2026, 10:30 a. m." in America/Bogota. Built by hand
 * (no `Intl`) so the text does not change with the ICU build. Colombia has no
 * daylight saving time, so the offset is fixed.
 */
export function formatBogotaDateTime(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + BOGOTA_OFFSET_MS);
  const hours = d.getUTCHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  const meridiem = hours < 12 ? "a. m." : "p. m.";
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}, ${hour12}:${minutes} ${meridiem}`;
}

/** "viernes 20 de noviembre de 2026" from a `YYYY-MM-DD` calendar date. */
export function formatBogotaDate(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${WEEKDAYS[d.getUTCDay()]} ${day} de ${MONTHS[month - 1]} de ${year}`;
}

// ---- Rows ------------------------------------------------------------------------

const instant = z.string().refine((v) => !Number.isNaN(Date.parse(v)));

const orderRowSchema = z.object({
  id: z.uuid(),
  chat_id: z.string(),
  status: z.enum(["abierto", "pagado", "vencido", "cancelado"]),
  payment_status: z
    .enum(["pendiente", "aprobado", "rechazado", "en_proceso", "reembolsado", "comprobante_recibido"])
    .nullable(),
  payment_ref: z.string().nullable(),
  paid_amount: cop.nullable(),
  confirmed_at: instant.nullable(),
  human_number: z.string().min(1),
  total_price: cop,
  delivery_fee: cop.nullable(),
  grand_total: cop,
  delivery_method: z.enum(["tienda", "domicilio"]).nullable(),
  desired_delivery_date: z.string().nullable(),
  created_at: instant,
});

const reservationRowSchema = z.object({
  id: z.string(),
  status: z.enum(["activa", "consumida", "liberada", "expirada"]),
  qty: z.number().int().positive(),
  unit_price: cop,
  total_price: cop,
  options: z.unknown(),
  expires_at: instant,
  created_at: z.string(),
  product_variants: z.object({
    attributes: z.unknown(),
    products: z.object({ name: z.string().min(1) }),
  }),
});

type ReservationRow = z.infer<typeof reservationRowSchema>;

const WEB_CHAT_PREFIX = "web:";
const PROCESSING_STATUSES = ["en_proceso", "comprobante_recibido", "aprobado"];

function toLine(row: ReservationRow): OrderViewLine {
  return {
    productName: row.product_variants.products.name,
    variantLabel: readLabel(row.product_variants.attributes),
    qty: row.qty,
    unitPrice: row.unit_price,
    totalPrice: row.total_price,
    options: readOptions(row.options).map((o) => ({ name: o.name, qty: o.qty, unitPrice: o.unitPrice })),
  };
}

const byCreation = (a: ReservationRow, b: ReservationRow) =>
  Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id);

/**
 * Reads `{ order, reservations }` as the adapter fetched them: the order row
 * and ALL its reservations (any status). `now` only decides whether an unpaid
 * hold has ended.
 */
export function parseOrderView(raw: unknown, now: Date): ParsedOrderView {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { kind: "malformed" };
  const body = raw as Record<string, unknown>;
  if (body.order === null || body.order === undefined) return { kind: "not_found" };

  // Same answer for "other channel" as for "missing": only web orders have a page.
  const chatId = (body.order as Record<string, unknown>).chat_id;
  if (typeof chatId !== "string" || !chatId.startsWith(WEB_CHAT_PREFIX)) return { kind: "not_found" };

  const orderParsed = orderRowSchema.safeParse(body.order);
  const reservationsParsed = z.array(reservationRowSchema).safeParse(body.reservations ?? []);
  if (!orderParsed.success || !reservationsParsed.success) return { kind: "malformed" };

  const o = orderParsed.data;
  const rows = [...reservationsParsed.data].sort(byCreation);
  const deliveryFee = o.delivery_fee ?? 0;

  const withStatus = (...statuses: ReservationRow["status"][]) => rows.filter((r) => statuses.includes(r.status));
  const sum = (items: ReservationRow[]) => items.reduce((total, r) => total + r.total_price, 0);
  const totalsAgree = o.total_price + deliveryFee === o.grand_total;
  const linesAgree = (items: ReservationRow[]) => items.length > 0 && sum(items) === o.total_price;

  let paymentState: PaymentState;
  let chosen: ReservationRow[];
  let strict = true;

  const live = withStatus("activa");
  const holdEnded = live.length > 0 && Math.min(...live.map((r) => Date.parse(r.expires_at))) <= now.getTime();

  if (o.payment_status === "reembolsado") {
    paymentState = "refunded";
    chosen = withStatus("consumida");
  } else if (o.status === "pagado") {
    paymentState = "paid";
    chosen = withStatus("consumida");
  } else if (o.status === "vencido" || o.status === "cancelado") {
    paymentState = "expired";
    chosen = withStatus("activa", "liberada", "expirada");
    strict = false;
  } else if (o.payment_status !== null && PROCESSING_STATUSES.includes(o.payment_status)) {
    paymentState = "processing";
    chosen = live.length > 0 ? live : withStatus("liberada", "expirada");
    strict = live.length > 0;
  } else if (live.length === 0 || holdEnded) {
    paymentState = "expired";
    chosen = withStatus("activa", "liberada", "expirada");
    strict = false;
  } else {
    paymentState = o.payment_status === "rechazado" ? "rejected" : "pending";
    chosen = live;
  }

  let lines: OrderViewLine[];
  if (strict) {
    if (!totalsAgree || !linesAgree(chosen)) return { kind: "inconsistent" };
    lines = chosen.map(toLine);
  } else {
    // Nothing is charged in these states: show the lines only if they still add up.
    lines = totalsAgree && linesAgree(chosen) ? chosen.map(toLine) : [];
  }

  let payment: OrderPaymentInfo | null = null;
  if (paymentState === "paid") {
    if (o.paid_amount === null || o.paid_amount !== o.grand_total) return { kind: "inconsistent" };
    payment = {
      reference: o.payment_ref,
      confirmedAtLabel: o.confirmed_at ? formatBogotaDateTime(o.confirmed_at) : null,
      paidAmount: o.paid_amount,
    };
  }

  return {
    kind: "ok",
    view: {
      orderId: o.id,
      humanNumber: o.human_number,
      createdAtLabel: formatBogotaDateTime(o.created_at) ?? "",
      paymentState,
      lines,
      subtotal: o.total_price,
      deliveryFee,
      grandTotal: o.grand_total,
      delivery: {
        method: o.delivery_method,
        dateLabel: o.desired_delivery_date ? formatBogotaDate(o.desired_delivery_date) : null,
      },
      payment,
    },
  };
}
