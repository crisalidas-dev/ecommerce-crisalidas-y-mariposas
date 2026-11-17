import { isOrderId } from "./orderView.ts";

/**
 * What the store webhook does with a payment, decided ONLY from Mercado
 * Pago's answer to `GET /v1/payments/{id}` (slice 7, README ADR-0010). Pure.
 *
 *   metadata.source !== 'web'          -> not_web    (n8n owns WhatsApp payments)
 *   approved                           -> confirm    (`confirm_order`)
 *     reference not a UUID             -> incident   (money charged, no order to confirm)
 *     currency not COP                 -> incident   (amounts are not comparable)
 *   rejected | cancelled               -> set_status rechazado
 *   pending | in_process | authorized  -> set_status en_proceso (PSE takes minutes)
 *   refunded | charged_back | other    -> no_op      (no RPC for refunds yet)
 *
 * `metadata` keys: the store sends `{ source, order_id }`, already lowercase
 * snake_case, so Mercado Pago's key normalisation cannot change them. The
 * value is compared exactly.
 */

export type MpPaymentStatus = "rechazado" | "en_proceso";

/** `confirm_order` refusal shape that `record_payment_incident` accepts as `p_refusal`. */
export interface Refusal {
  ok: false;
  error: string;
  [key: string]: unknown;
}

export type PaymentDecision =
  | {
      kind: "confirm";
      orderId: string;
      /** `String(payment.id)`: `confirm_order`'s idempotency key (`p_payment_ref`). */
      paymentRef: string;
      /** `transaction_amount` as reported. */
      amount: number;
      externalReference: string;
    }
  | {
      /** Approved, but `confirm_order` cannot even be asked: record the incident directly. */
      kind: "incident";
      orderId: string | null;
      paymentRef: string;
      amount: number;
      externalReference: string | null;
      refusal: Refusal;
    }
  | { kind: "set_status"; orderId: string; paymentStatus: MpPaymentStatus; mpStatus: string }
  | { kind: "no_op"; reason: "unhandled_status" | "no_order"; mpStatus: string; orderId: string | null }
  | { kind: "not_web" }
  /** Unreadable or about another payment: answer 500 so Mercado Pago retries. */
  | { kind: "malformed" };

const REJECTED: readonly string[] = ["rejected", "cancelled"];
const IN_PROCESS: readonly string[] = ["pending", "in_process", "authorized"];

function readId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[0-9]{1,20}$/.test(value)) return value;
  return null;
}

export function decidePayment(raw: unknown, requestedId: string): PaymentDecision {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { kind: "malformed" };
  const p = raw as Record<string, unknown>;

  const paymentRef = readId(p.id);
  const mpStatus = typeof p.status === "string" ? p.status.trim() : "";
  if (paymentRef === null || paymentRef !== requestedId || mpStatus === "") return { kind: "malformed" };

  const metadata = p.metadata;
  const source =
    typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>).source : undefined;
  if (source !== "web") return { kind: "not_web" };

  const externalReference =
    typeof p.external_reference === "string" && p.external_reference.trim() !== "" ? p.external_reference.trim() : null;
  const orderId = externalReference !== null && isOrderId(externalReference) ? externalReference.toLowerCase() : null;

  if (mpStatus === "approved") {
    const amount = p.transaction_amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return { kind: "malformed" };
    if (orderId === null) {
      return {
        kind: "incident",
        orderId: null,
        paymentRef,
        amount,
        externalReference,
        refusal: { ok: false, error: "PEDIDO_NO_EXISTE" },
      };
    }
    if (p.currency_id !== "COP") {
      return {
        kind: "incident",
        orderId,
        paymentRef,
        amount,
        externalReference,
        refusal: { ok: false, error: "MONEDA_NO_COP" },
      };
    }
    return { kind: "confirm", orderId, paymentRef, amount, externalReference: externalReference as string };
  }

  const paymentStatus: MpPaymentStatus | null = REJECTED.includes(mpStatus)
    ? "rechazado"
    : IN_PROCESS.includes(mpStatus)
      ? "en_proceso"
      : null;
  if (paymentStatus === null) return { kind: "no_op", reason: "unhandled_status", mpStatus, orderId };
  if (orderId === null) return { kind: "no_op", reason: "no_order", mpStatus, orderId: null };
  return { kind: "set_status", orderId, paymentStatus, mpStatus };
}
