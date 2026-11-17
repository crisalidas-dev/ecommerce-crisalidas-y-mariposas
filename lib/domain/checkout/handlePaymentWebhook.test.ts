import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handlePaymentWebhook,
  type ConfirmOrderInput,
  type GetPaymentOutcome,
  type PaymentIncidentInput,
  type PaymentWebhookDeps,
  type PaymentWebhookRequest,
} from "./handlePaymentWebhook.ts";

// Same openssl vector as webhookSignature.test.ts:
//   manifest "id:123456;request-id:<REQUEST_ID>;ts:<TS>;", secret "nacer-test-secret".
const SECRET = "nacer-test-secret";
const TS = "1742505638683";
const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const V1 = "0fd248f386049b909e30b8dabaf4169c648f6c6cad78582b9d3221b52d297fc6";
const ORDER_ID = "7f1c2b7e-1111-4222-8333-444455556666";

function request(patch: Partial<PaymentWebhookRequest> = {}): PaymentWebhookRequest {
  return {
    query: new URLSearchParams("data.id=123456&type=payment"),
    body: { action: "payment.updated", data: { id: "123456" }, type: "payment" },
    signature: `ts=${TS},v1=${V1}`,
    requestId: REQUEST_ID,
    ...patch,
  };
}

function payment(patch: Record<string, unknown> = {}) {
  return {
    id: 123456,
    status: "approved",
    external_reference: ORDER_ID,
    metadata: { source: "web", order_id: ORDER_ID },
    currency_id: "COP",
    transaction_amount: 212000,
    payer: { email: "comprador@example.com", identification: { number: "1020304050" } },
    ...patch,
  };
}

interface Calls {
  lookups: string[];
  confirms: ConfirmOrderInput[];
  statuses: { orderId: string; status: string }[];
  incidents: PaymentIncidentInput[];
  errors: string[];
}

function deps(over: Partial<PaymentWebhookDeps> & { mp?: unknown } = {}): { deps: PaymentWebhookDeps; calls: Calls } {
  const calls: Calls = { lookups: [], confirms: [], statuses: [], incidents: [], errors: [] };
  const mp = "mp" in over ? over.mp : payment();
  return {
    calls,
    deps: {
      secret: SECRET,
      getPayment: async (id): Promise<GetPaymentOutcome> => {
        calls.lookups.push(id);
        return { ok: true, payment: mp };
      },
      confirmOrder: async (input) => {
        calls.confirms.push(input);
        return { ok: true, order_id: input.orderId, payment_ref: input.paymentRef };
      },
      setPaymentStatus: async (orderId, status) => {
        calls.statuses.push({ orderId, status });
        return { ok: true };
      },
      recordPaymentIncident: async (input) => {
        calls.incidents.push(input);
        return {
          ok: true,
          registrado: true,
          nuevo: true,
          incidente_id: "inc-1",
          motivo: "reserva_vencida",
          codigo_rechazo: input.refusal.error,
          order_id: input.orderId,
          monto: input.amount,
        };
      },
      logError: (line) => {
        calls.errors.push(line);
      },
      ...over,
    },
  };
}

const noWrites = (calls: Calls) =>
  calls.confirms.length === 0 && calls.statuses.length === 0 && calls.incidents.length === 0;

describe("handlePaymentWebhook: signature gate", () => {
  it("answers 401 without looking anything up when the signature is missing", async () => {
    const { deps: d, calls } = deps();
    const r = await handlePaymentWebhook(request({ signature: null }), d);
    assert.equal(r.status, 401);
    assert.equal(calls.lookups.length, 0);
    assert.ok(noWrites(calls));
  });

  it("answers 401 when the signature does not match", async () => {
    for (const patch of [
      { signature: `ts=${TS},v1=${"0".repeat(64)}` },
      { signature: "garbage" },
      { requestId: "another-request" },
      { query: new URLSearchParams("data.id=123457&type=payment"), body: null },
    ]) {
      const { deps: d, calls } = deps();
      const r = await handlePaymentWebhook(request(patch), d);
      assert.equal(r.status, 401, JSON.stringify(patch));
      assert.equal(calls.lookups.length, 0);
    }
  });

  it("answers 401 when the unsigned body names another payment than the signed query", async () => {
    const { deps: d, calls } = deps();
    const r = await handlePaymentWebhook(request({ body: { type: "payment", data: { id: "999" } } }), d);
    assert.equal(r.status, 401);
    assert.equal(calls.lookups.length, 0);
  });

  it("answers 500 with a clear log, never the value, when MP_WEBHOOK_SECRET is missing", async () => {
    for (const secret of [undefined, "", "   "]) {
      const { deps: d, calls } = deps({ secret });
      const r = await handlePaymentWebhook(request(), d);
      assert.equal(r.status, 500);
      assert.equal(calls.lookups.length, 0);
      assert.ok(calls.errors.some((l) => l.includes("MP_WEBHOOK_SECRET")), calls.errors.join("\n"));
    }
  });
});

describe("handlePaymentWebhook: ignored notifications", () => {
  it("answers 200 to other topics without verifying or looking up anything", async () => {
    const { deps: d, calls } = deps();
    const r = await handlePaymentWebhook(
      request({ query: new URLSearchParams("topic=merchant_order&id=1"), body: null, signature: null }),
      d,
    );
    assert.equal(r.status, 200);
    assert.equal(calls.lookups.length, 0);
  });

  it("answers 200 to an unsigned IPN payment notification without acting on it", async () => {
    const { deps: d, calls } = deps();
    const r = await handlePaymentWebhook(
      request({ query: new URLSearchParams("topic=payment&id=123456"), body: null, signature: null }),
      d,
    );
    assert.equal(r.status, 200);
    assert.equal(calls.lookups.length, 0);
  });
});

describe("handlePaymentWebhook: Mercado Pago lookup", () => {
  it("looks the payment up by the signed id", async () => {
    const { deps: d, calls } = deps();
    await handlePaymentWebhook(request(), d);
    assert.deepEqual(calls.lookups, ["123456"]);
  });

  it("answers 500 so Mercado Pago retries when the lookup fails", async () => {
    for (const outcome of [
      { ok: false, error: "unavailable" },
      { ok: false, error: "not_found" },
      { ok: false, error: "not_configured" },
    ] as GetPaymentOutcome[]) {
      const { deps: d, calls } = deps({ getPayment: async () => outcome });
      const r = await handlePaymentWebhook(request(), d);
      assert.equal(r.status, 500, JSON.stringify(outcome));
      assert.ok(noWrites(calls));
    }
  });

  it("names MP_ACCESS_TOKEN in the log when it is missing", async () => {
    const { deps: d, calls } = deps({ getPayment: async () => ({ ok: false, error: "not_configured" }) });
    await handlePaymentWebhook(request(), d);
    assert.ok(calls.errors.some((l) => l.includes("MP_ACCESS_TOKEN")), calls.errors.join("\n"));
  });

  it("answers 500 when the lookup throws or answers something unreadable", async () => {
    const { deps: d } = deps({
      getPayment: async () => {
        throw new Error("timeout");
      },
    });
    assert.equal((await handlePaymentWebhook(request(), d)).status, 500);

    const { deps: d2, calls } = deps({ mp: { nonsense: true } });
    assert.equal((await handlePaymentWebhook(request(), d2)).status, 500);
    assert.ok(noWrites(calls));
  });

  it("answers 200 without a lookup for a signed id that is not a payment id", async () => {
    // A notification signed over a non-numeric id (e.g. a panel simulator test).
    const { deps: d, calls } = deps({ secret: SECRET });
    const r = await handlePaymentWebhook(
      request({
        query: new URLSearchParams("type=payment"),
        body: { type: "payment", data: { id: "abc" } },
        // Manifest without id: "request-id:<REQUEST_ID>;ts:<TS>;".
        signature: `ts=${TS},v1=82090aa4e77190e5b931bf971693aefbd5caffb7d4d00269ec658f90b44e3449`,
      }),
      d,
    );
    assert.equal(r.status, 200);
    assert.equal(calls.lookups.length, 0);
  });
});

describe("handlePaymentWebhook: approved", () => {
  it("confirms the order with confirm_order('mercadopago', payment id, amount)", async () => {
    const { deps: d, calls } = deps();
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.deepEqual(calls.confirms, [
      { orderId: ORDER_ID, source: "mercadopago", paymentRef: "123456", paidAmount: 212000 },
    ]);
    assert.equal(calls.incidents.length, 0);
  });

  it("treats a retry of the same payment (mismo_pago) as done, without an incident", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => ({ ok: false, error: "PEDIDO_NO_ABIERTO", ya_pagado: true, mismo_pago: true }),
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.incidents.length, 0);
    assert.equal(calls.errors.length, 0);
  });

  it("records a refusal as a web incident, passing confirm_order's answer verbatim", async () => {
    const refusal = {
      ok: false,
      error: "LINEAS_INVALIDAS",
      mensaje: "Reserva vencida",
      lineas: [{ variant_sku: "CRI-001-V01", vencida: true }],
    };
    const { deps: d, calls } = deps({ confirmOrder: async () => refusal });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.deepEqual(calls.incidents, [
      {
        mpPaymentId: "123456",
        channel: "web",
        orderId: ORDER_ID,
        amount: 212000,
        mpStatus: "approved",
        refusal,
        externalReference: ORDER_ID,
      },
    ]);
  });

  it("alerts the operator once, when the incident is new, without customer data", async () => {
    const { deps: d, calls } = deps({ confirmOrder: async () => ({ ok: false, error: "MONTO_NO_COINCIDE" }) });
    await handlePaymentWebhook(request(), d);
    const alerts = calls.errors.filter((l) => l.includes("payment_incident"));
    assert.equal(alerts.length, 1, calls.errors.join("\n"));
    assert.ok(alerts[0].includes(ORDER_ID));
    assert.ok(alerts[0].includes("reserva_vencida"));
    assert.ok(alerts[0].includes("212000"));
    assert.ok(!alerts[0].includes("comprador@example.com"));
    assert.ok(!alerts[0].includes("1020304050"));
  });

  it("does not alert again when the incident already existed (retry)", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => ({ ok: false, error: "PEDIDO_NO_ABIERTO", ya_pagado: false }),
      recordPaymentIncident: async () => ({ ok: true, registrado: true, nuevo: false, incidente_id: "inc-1" }),
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.errors.filter((l) => l.includes("payment_incident_alert")).length, 0);
  });

  it("accepts the database saying the payment is already confirmed (no incident)", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => ({ ok: false, error: "PEDIDO_NO_ABIERTO" }),
      recordPaymentIncident: async () => ({ ok: true, registrado: false, motivo: "PAGO_YA_CONFIRMADO" }),
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.errors.filter((l) => l.includes("payment_incident_alert")).length, 0);
  });

  it("answers 500 when confirm_order cannot be reached or answers nonsense", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => {
        throw new Error("db down");
      },
    });
    assert.equal((await handlePaymentWebhook(request(), d)).status, 500);
    assert.equal(calls.incidents.length, 0);

    for (const answer of [null, "x", {}, { ok: false }]) {
      const { deps: d2 } = deps({ confirmOrder: async () => answer });
      assert.equal((await handlePaymentWebhook(request(), d2)).status, 500, JSON.stringify(answer));
    }
  });

  it("answers 500 when the incident cannot be recorded, and still alerts the operator", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => ({ ok: false, error: "PEDIDO_NO_ABIERTO", ya_pagado: true, mismo_pago: false }),
      recordPaymentIncident: async () => {
        throw new Error("db down");
      },
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 500);
    assert.equal(calls.errors.filter((l) => l.includes("payment_incident_alert")).length, 1);
  });

  it("alerts and answers 200 when the database refuses the incident itself (retrying would not help)", async () => {
    const { deps: d, calls } = deps({
      confirmOrder: async () => ({ ok: false, error: "MONTO_NO_COINCIDE" }),
      recordPaymentIncident: async () => ({ ok: false, error: "MONTO_INVALIDO" }),
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    const alerts = calls.errors.filter((l) => l.includes("payment_incident_alert"));
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0].includes("MONTO_INVALIDO"));
  });

  it("answers 500 when the incident answer is unreadable", async () => {
    const { deps: d } = deps({
      confirmOrder: async () => ({ ok: false, error: "MONTO_NO_COINCIDE" }),
      recordPaymentIncident: async () => null,
    });
    assert.equal((await handlePaymentWebhook(request(), d)).status, 500);
  });

  it("records an incident with no order when the reference is not a UUID", async () => {
    const { deps: d, calls } = deps({ mp: payment({ external_reference: "C0002" }) });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.confirms.length, 0);
    assert.deepEqual(calls.incidents, [
      {
        mpPaymentId: "123456",
        channel: "web",
        orderId: null,
        amount: 212000,
        mpStatus: "approved",
        refusal: { ok: false, error: "PEDIDO_NO_EXISTE" },
        externalReference: "C0002",
      },
    ]);
  });

  it("records an incident when the order does not exist (confirm_order says PEDIDO_NO_EXISTE)", async () => {
    const { deps: d, calls } = deps({ confirmOrder: async () => ({ ok: false, error: "PEDIDO_NO_EXISTE" }) });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.incidents.length, 1);
    assert.equal(calls.incidents[0].orderId, ORDER_ID);
  });
});

describe("handlePaymentWebhook: intermediate states", () => {
  it("stores rechazado for a rejected payment", async () => {
    const { deps: d, calls } = deps({ mp: payment({ status: "rejected" }) });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.deepEqual(calls.statuses, [{ orderId: ORDER_ID, status: "rechazado" }]);
    assert.equal(calls.confirms.length, 0);
  });

  it("stores en_proceso for a pending PSE payment, which may settle minutes later", async () => {
    const { deps: d, calls } = deps({ mp: payment({ status: "in_process" }) });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.deepEqual(calls.statuses, [{ orderId: ORDER_ID, status: "en_proceso" }]);
  });

  it("answers 200 when the order is already closed (a late notification)", async () => {
    const { deps: d, calls } = deps({
      mp: payment({ status: "rejected" }),
      setPaymentStatus: async () => ({ ok: false, error: "PEDIDO_NO_ABIERTO" }),
    });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.equal(calls.errors.length, 1);
  });

  it("answers 500 when set_payment_status cannot be reached or answers nonsense", async () => {
    const { deps: d } = deps({
      mp: payment({ status: "pending" }),
      setPaymentStatus: async () => {
        throw new Error("db down");
      },
    });
    assert.equal((await handlePaymentWebhook(request(), d)).status, 500);
    const { deps: d2 } = deps({ mp: payment({ status: "pending" }), setPaymentStatus: async () => "x" });
    assert.equal((await handlePaymentWebhook(request(), d2)).status, 500);
  });

  it("logs and does nothing for a refund or chargeback (no RPC exists yet)", async () => {
    for (const status of ["refunded", "charged_back"]) {
      const { deps: d, calls } = deps({ mp: payment({ status }) });
      const r = await handlePaymentWebhook(request(), d);
      assert.equal(r.status, 200);
      assert.ok(noWrites(calls));
      assert.ok(calls.errors.some((l) => l.includes(status)), calls.errors.join("\n"));
    }
  });
});

describe("handlePaymentWebhook: payments of other channels", () => {
  it("answers 200 and writes nothing for a WhatsApp payment (n8n owns it)", async () => {
    const { deps: d, calls } = deps({ mp: payment({ metadata: {} }) });
    const r = await handlePaymentWebhook(request(), d);
    assert.equal(r.status, 200);
    assert.ok(noWrites(calls));
  });
});
