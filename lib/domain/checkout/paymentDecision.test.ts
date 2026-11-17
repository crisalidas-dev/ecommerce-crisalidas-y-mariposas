import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decidePayment } from "./paymentDecision.ts";

const ORDER_ID = "7f1c2b7e-1111-4222-8333-444455556666";

/** Shape of `GET /v1/payments/{id}`, reduced to what the decision reads plus some noise. */
function payment(patch: Record<string, unknown> = {}) {
  return {
    id: 123456,
    status: "approved",
    status_detail: "accredited",
    external_reference: ORDER_ID,
    metadata: { source: "web", order_id: ORDER_ID },
    currency_id: "COP",
    transaction_amount: 212000,
    payer: { email: "comprador@example.com" },
    live_mode: false,
    ...patch,
  };
}

describe("decidePayment: approved", () => {
  it("confirms an approved web payment with its id, amount and order", () => {
    assert.deepEqual(decidePayment(payment(), "123456"), {
      kind: "confirm",
      orderId: ORDER_ID,
      paymentRef: "123456",
      amount: 212000,
      externalReference: ORDER_ID,
    });
  });

  it("accepts the id as a numeric string and an uppercase UUID reference", () => {
    const r = decidePayment(payment({ id: "123456", external_reference: ORDER_ID.toUpperCase() }), "123456");
    assert.equal(r.kind, "confirm");
    assert.equal(r.kind === "confirm" && r.orderId, ORDER_ID);
  });

  it("keeps a fractional amount as reported (confirm_order compares with 0.01 tolerance)", () => {
    const r = decidePayment(payment({ transaction_amount: 212000.5 }), "123456");
    assert.equal(r.kind === "confirm" && r.amount, 212000.5);
  });

  it("records an incident when the reference is not a UUID: money was charged", () => {
    for (const ref of ["C0002", "", null, undefined, "7f1c2b7e-1111-4222-8333"]) {
      const r = decidePayment(payment({ external_reference: ref }), "123456");
      assert.deepEqual(
        r,
        {
          kind: "incident",
          orderId: null,
          paymentRef: "123456",
          amount: 212000,
          externalReference: typeof ref === "string" && ref !== "" ? ref : null,
          refusal: { ok: false, error: "PEDIDO_NO_EXISTE" },
        },
        String(ref),
      );
    }
  });

  it("records an incident, without confirming, when the currency is not COP", () => {
    const r = decidePayment(payment({ currency_id: "USD" }), "123456");
    assert.equal(r.kind, "incident");
    assert.equal(r.kind === "incident" && r.orderId, ORDER_ID);
    assert.deepEqual(r.kind === "incident" && r.refusal, { ok: false, error: "MONEDA_NO_COP" });
  });

  it("treats an approved payment without a positive amount as unreadable", () => {
    for (const amount of [0, -1, null, "212000", Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(decidePayment(payment({ transaction_amount: amount }), "123456").kind, "malformed", String(amount));
    }
  });
});

describe("decidePayment: intermediate and final states", () => {
  it("maps rejected and cancelled to rechazado", () => {
    for (const status of ["rejected", "cancelled"]) {
      assert.deepEqual(decidePayment(payment({ status }), "123456"), {
        kind: "set_status",
        orderId: ORDER_ID,
        paymentStatus: "rechazado",
        mpStatus: status,
      });
    }
  });

  it("maps pending, in_process and authorized to en_proceso (PSE takes minutes)", () => {
    for (const status of ["pending", "in_process", "authorized"]) {
      const r = decidePayment(payment({ status }), "123456");
      assert.equal(r.kind === "set_status" && r.paymentStatus, "en_proceso", status);
    }
  });

  it("does not need COP or an amount to record an intermediate state", () => {
    const r = decidePayment(payment({ status: "pending", currency_id: undefined, transaction_amount: undefined }), "123456");
    assert.equal(r.kind, "set_status");
  });

  it("does nothing for refunds, chargebacks, mediation or unknown states (no RPC exists)", () => {
    for (const status of ["refunded", "charged_back", "in_mediation", "something_new"]) {
      assert.deepEqual(decidePayment(payment({ status }), "123456"), {
        kind: "no_op",
        reason: "unhandled_status",
        mpStatus: status,
        orderId: ORDER_ID,
      });
    }
  });

  it("does nothing for a non-approved state whose reference is not an order", () => {
    const r = decidePayment(payment({ status: "rejected", external_reference: "garbage" }), "123456");
    assert.deepEqual(r, { kind: "no_op", reason: "no_order", mpStatus: "rejected", orderId: null });
  });
});

describe("decidePayment: not a web payment", () => {
  it("leaves payments without metadata.source = web to n8n (WhatsApp)", () => {
    for (const metadata of [{}, { source: "whatsapp" }, { source: "WEB" }, null, undefined, "web", { Source: "web" }]) {
      assert.deepEqual(decidePayment(payment({ metadata }), "123456"), { kind: "not_web" }, JSON.stringify(metadata));
    }
  });
});

describe("decidePayment: unreadable answers", () => {
  it("refuses anything that is not a payment object", () => {
    for (const raw of [null, undefined, "x", 1, [], {}]) {
      assert.equal(decidePayment(raw, "123456").kind, "malformed", JSON.stringify(raw));
    }
  });

  it("refuses a payment without a status", () => {
    assert.equal(decidePayment(payment({ status: undefined }), "123456").kind, "malformed");
  });

  it("refuses an answer about another payment id", () => {
    assert.equal(decidePayment(payment({ id: 999 }), "123456").kind, "malformed");
  });
});
