import { decidePayment, type MpPaymentStatus, type Refusal } from "./paymentDecision.ts";
import { isPaymentId, parsePaymentNotification } from "./paymentNotification.ts";
import { verifyWebhookSignature } from "./webhookSignature.ts";

/**
 * Use case behind `POST /api/webhooks/mercadopago` (slice 7, README ADR-0010).
 *
 *   parse -> verify x-signature -> GET /v1/payments/{id} -> decide -> one RPC
 *
 * Nothing in the notification body decides anything: it only names the
 * payment, and the lookup's answer is the truth. `confirm_order` is the only
 * writer of a paid order; `set_payment_status` only stores intermediate
 * states. Processed inline (no queue yet): lookup plus one RPC stay far below
 * the 22 s Mercado Pago waits.
 *
 * HTTP semantics, so Mercado Pago retries exactly what can still succeed:
 *   401  missing or invalid signature (a forged notification is never retried
 *        by Mercado Pago; a real one under a wrong secret is, and recovers)
 *   500  anything transient: secret or token missing, lookup failed, database
 *        unreachable or unreadable answer
 *   200  everything decided, including business refusals and ignored topics
 *
 * Idempotency: `confirm_order` is idempotent by `p_payment_ref` (the payment
 * id) and answers `mismo_pago: true` to a retry; `record_payment_incident` is
 * idempotent by `mp_payment_id` and answers `nuevo: false`. Processing the
 * same notification twice changes nothing and alerts once.
 *
 * Logs carry ids, codes and amounts only: never the token, the secret, the
 * Mercado Pago payload or customer data.
 */

// ---- Ports -----------------------------------------------------------------------

export type GetPaymentOutcome =
  | { ok: true; payment: unknown }
  | {
      ok: false;
      /**
       * not_configured: MP_ACCESS_TOKEN missing. not_found: 404 (sandbox vs
       * production token, or not readable yet). unavailable: network, timeout,
       * 5xx, 401/403 or an unreadable answer.
       */
      error: "not_found" | "unavailable" | "not_configured";
    };

export interface ConfirmOrderInput {
  orderId: string;
  source: "mercadopago";
  paymentRef: string;
  paidAmount: number;
}

export interface PaymentIncidentInput {
  mpPaymentId: string;
  channel: "web";
  orderId: string | null;
  amount: number;
  mpStatus: "approved";
  /** `confirm_order`'s refusal, verbatim. */
  refusal: Refusal;
  externalReference: string | null;
}

export interface PaymentWebhookDeps {
  /** `MP_WEBHOOK_SECRET`. */
  secret: string | undefined;
  getPayment: (paymentId: string) => Promise<GetPaymentOutcome>;
  /** `confirm_order`; returns its raw jsonb, throws on transport errors. */
  confirmOrder: (input: ConfirmOrderInput) => Promise<unknown>;
  /** `set_payment_status`; returns its raw jsonb, throws on transport errors. */
  setPaymentStatus: (orderId: string, status: MpPaymentStatus) => Promise<unknown>;
  /** `record_payment_incident`; returns its raw jsonb, throws on transport errors. */
  recordPaymentIncident: (input: PaymentIncidentInput) => Promise<unknown>;
  logError: (line: string) => void;
}

export interface PaymentWebhookRequest {
  query: URLSearchParams;
  /** Parsed JSON body, or null. */
  body: unknown;
  /** `x-signature` header. */
  signature: string | null;
  /** `x-request-id` header. */
  requestId: string | null;
}

export type WebhookOutcome =
  | "ignored"
  | "unauthorized"
  | "not_configured"
  | "lookup_failed"
  | "not_web"
  | "confirmed"
  | "already_confirmed"
  | "incident_recorded"
  | "incident_not_recorded"
  | "status_saved"
  | "status_refused"
  | "no_op"
  | "db_failed";

export interface WebhookResult {
  status: 200 | 401 | 500;
  outcome: WebhookOutcome;
}

const done = (outcome: WebhookOutcome): WebhookResult => ({ status: 200, outcome });
const retry = (outcome: WebhookOutcome): WebhookResult => ({ status: 500, outcome });
const UNAUTHORIZED: WebhookResult = { status: 401, outcome: "unauthorized" };

const TAG = "mercadopago webhook";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// ---- Use case --------------------------------------------------------------------

export async function handlePaymentWebhook(
  req: PaymentWebhookRequest,
  deps: PaymentWebhookDeps,
): Promise<WebhookResult> {
  // 1. Which payment, if any. Ignored topics are never processed.
  const notification = parsePaymentNotification({ query: req.query, body: req.body });
  if (notification.kind === "ignored") return done("ignored");
  if (notification.kind === "mismatch") return UNAUTHORIZED;

  // 2. Signature.
  const secret = deps.secret?.trim();
  if (!secret) {
    deps.logError(`${TAG}: MP_WEBHOOK_SECRET is not set; answering 500 so Mercado Pago retries`);
    return retry("not_configured");
  }
  const signed = verifyWebhookSignature({
    header: req.signature,
    dataId: notification.signedDataId,
    requestId: req.requestId,
    secret,
  });
  if (!signed) return UNAUTHORIZED;

  const paymentId = notification.paymentId;
  if (!isPaymentId(paymentId)) {
    deps.logError(`${TAG}: signed notification with a non-numeric payment id; ignored`);
    return done("ignored");
  }

  // 3. The truth: Mercado Pago's API.
  let lookup: GetPaymentOutcome;
  try {
    lookup = await deps.getPayment(paymentId);
  } catch {
    lookup = { ok: false, error: "unavailable" };
  }
  if (!lookup.ok) {
    if (lookup.error === "not_configured") {
      deps.logError(`${TAG}: MP_ACCESS_TOKEN is not set; payment ${paymentId} not processed`);
      return retry("not_configured");
    }
    deps.logError(`${TAG}: payment ${paymentId} lookup failed (${lookup.error})`);
    return retry("lookup_failed");
  }

  // 4. Decide.
  const decision = decidePayment(lookup.payment, paymentId);
  switch (decision.kind) {
    case "malformed":
      deps.logError(`${TAG}: payment ${paymentId} lookup answer is unreadable`);
      return retry("lookup_failed");
    case "not_web":
      return done("not_web");
    case "no_op":
      deps.logError(
        `${TAG}: payment ${paymentId} is ${decision.mpStatus} for order ${decision.orderId ?? "none"}; no action (${decision.reason})`,
      );
      return done("no_op");
    case "set_status":
      return saveStatus(paymentId, decision.orderId, decision.paymentStatus, decision.mpStatus, deps);
    case "incident":
      return recordIncident(
        {
          mpPaymentId: decision.paymentRef,
          channel: "web",
          orderId: decision.orderId,
          amount: decision.amount,
          mpStatus: "approved",
          refusal: decision.refusal,
          externalReference: decision.externalReference,
        },
        deps,
      );
    case "confirm":
      return confirm(decision, deps);
  }
}

async function confirm(
  decision: { orderId: string; paymentRef: string; amount: number; externalReference: string },
  deps: PaymentWebhookDeps,
): Promise<WebhookResult> {
  let raw: unknown;
  try {
    raw = await deps.confirmOrder({
      orderId: decision.orderId,
      source: "mercadopago",
      paymentRef: decision.paymentRef,
      paidAmount: decision.amount,
    });
  } catch {
    deps.logError(`${TAG}: confirm_order unreachable for order ${decision.orderId}, payment ${decision.paymentRef}`);
    return retry("db_failed");
  }

  const answer = record(raw);
  if (answer?.ok === true) return done("confirmed");
  if (answer?.ok === false && answer.mismo_pago === true) return done("already_confirmed");
  if (answer?.ok !== false || typeof answer.error !== "string") {
    deps.logError(`${TAG}: confirm_order answer unreadable for order ${decision.orderId}`);
    return retry("db_failed");
  }

  // Approved and refused: money was charged without a confirmed sale.
  return recordIncident(
    {
      mpPaymentId: decision.paymentRef,
      channel: "web",
      orderId: decision.orderId,
      amount: decision.amount,
      mpStatus: "approved",
      refusal: answer as Refusal,
      externalReference: decision.externalReference,
    },
    deps,
  );
}

/**
 * Operator alert for money charged without a confirmed sale. One JSON line,
 * no customer data. The panel view of `payment_incidents` (spec 038, T-11) is
 * where the operator resolves it; this line is the log-side alert.
 */
function alert(input: PaymentIncidentInput, extra: Record<string, unknown>, deps: PaymentWebhookDeps): void {
  deps.logError(
    `payment_incident_alert ${JSON.stringify({
      channel: input.channel,
      mp_payment_id: input.mpPaymentId,
      order_id: input.orderId,
      external_reference: input.orderId === null ? input.externalReference?.slice(0, 64) ?? null : undefined,
      amount: input.amount,
      refusal_code: input.refusal.error,
      ...extra,
    })}`,
  );
}

async function recordIncident(input: PaymentIncidentInput, deps: PaymentWebhookDeps): Promise<WebhookResult> {
  let raw: unknown;
  try {
    raw = await deps.recordPaymentIncident(input);
  } catch {
    // The alert must not be lost: log it now, and 500 so the record is retried.
    alert(input, { registered: false, error: "RPC_UNREACHABLE" }, deps);
    return retry("db_failed");
  }

  const answer = record(raw);
  if (answer?.ok === true) {
    if (answer.registrado === false) return done("already_confirmed");
    if (answer.nuevo === true) {
      alert(
        input,
        { registered: true, incident_id: answer.incidente_id ?? null, motivo: answer.motivo ?? null },
        deps,
      );
    }
    return done("incident_recorded");
  }
  if (answer?.ok === false) {
    // A validation refusal is deterministic: retrying would not record it.
    alert(input, { registered: false, error: typeof answer.error === "string" ? answer.error : "UNKNOWN" }, deps);
    return done("incident_not_recorded");
  }
  alert(input, { registered: false, error: "UNREADABLE_ANSWER" }, deps);
  return retry("db_failed");
}

async function saveStatus(
  paymentId: string,
  orderId: string,
  status: MpPaymentStatus,
  mpStatus: string,
  deps: PaymentWebhookDeps,
): Promise<WebhookResult> {
  let raw: unknown;
  try {
    raw = await deps.setPaymentStatus(orderId, status);
  } catch {
    deps.logError(`${TAG}: set_payment_status unreachable for order ${orderId}`);
    return retry("db_failed");
  }
  const answer = record(raw);
  if (answer?.ok === true) return done("status_saved");
  if (answer?.ok === false && typeof answer.error === "string") {
    // e.g. PEDIDO_NO_ABIERTO: a late notification for an order already paid or expired.
    deps.logError(
      `${TAG}: set_payment_status(${status}) refused for order ${orderId}, payment ${paymentId} (${mpStatus}): ${answer.error}`,
    );
    return done("status_refused");
  }
  deps.logError(`${TAG}: set_payment_status answer unreadable for order ${orderId}`);
  return retry("db_failed");
}
