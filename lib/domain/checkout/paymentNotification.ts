/**
 * What a Mercado Pago notification says, reduced to "which payment changed"
 * (slice 7). Pure. The notification only says THAT something changed; the
 * truth about the payment comes from `GET /v1/payments/{id}` (README ADR-0010).
 *
 * Checkout Pro posts to `notification_url` with `?data.id=<id>&type=payment`
 * in the query string and a JSON body `{ type, action, data: { id } }`. The
 * signature covers the QUERY `data.id`, so that one wins; a body that
 * contradicts it is refused. The body is only a fallback when the query
 * carries no id (the manifest then omits `id`).
 *
 * Ignored, answered 200 so Mercado Pago stops retrying, and never processed:
 *  - other topics (`merchant_order`, plans, ...): the store only reacts to payments;
 *  - payment notifications without `data.id`, i.e. the legacy unsigned IPN
 *    (`?topic=payment&id=…`). Mercado Pago sends a signed webhook for the same
 *    event, and an unsigned message is never acted upon.
 */

export type PaymentNotification =
  | {
      kind: "payment";
      /** Id to look up, as received. Not validated yet: see `isPaymentId`. */
      paymentId: string;
      /** The query-string `data.id` that the signature covers, or null when absent. */
      signedDataId: string | null;
    }
  /** The unsigned body names another payment than the signed query string. */
  | { kind: "mismatch" }
  | { kind: "ignored"; reason: "topic" | "no_id" };

export interface NotificationInput {
  query: URLSearchParams;
  /** Parsed JSON body, or null when absent or unreadable. */
  body: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

export function parsePaymentNotification({ query, body }: NotificationInput): PaymentNotification {
  const json = record(body);
  const topic = text(query.get("type")) ?? text(query.get("topic")) ?? text(json?.type) ?? text(json?.topic);
  if (topic !== "payment") return { kind: "ignored", reason: "topic" };

  const queryId = text(query.get("data.id"));
  const bodyId = text(record(json?.data)?.id);
  if (queryId !== null && bodyId !== null && queryId !== bodyId) return { kind: "mismatch" };

  const paymentId = queryId ?? bodyId;
  if (paymentId === null) return { kind: "ignored", reason: "no_id" };
  return { kind: "payment", paymentId, signedDataId: queryId };
}

/** Mercado Pago payment ids are numeric. Anything else never reaches the API URL. */
export function isPaymentId(value: string): boolean {
  return /^[0-9]{1,20}$/.test(value);
}
