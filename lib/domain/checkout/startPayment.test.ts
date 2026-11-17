import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CheckoutPreference } from "./mercadoPagoPreference.ts";
import {
  parsePaymentOrder,
  startPayment,
  type CreatePreferenceOutcome,
  type PaymentLinkToSave,
  type StartPaymentDeps,
} from "./startPayment.ts";

const ORDER_ID = "7f1c2b7e-1111-4222-8333-444455556666";
const ATTEMPT = "6f1c2b7e-1111-4222-8333-444455556666";
const SITE = "https://tienda.nacergroup.co";
const NOW = new Date("2026-11-17T15:00:00.000Z");
const INIT_POINT = "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=pref-1";

function row(patch: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    chat_id: `web:${ATTEMPT}`,
    status: "abierto",
    payment_status: "pendiente",
    human_number: "C0002",
    total_price: 200000,
    delivery_fee: 12000,
    grand_total: 212000,
    init_point: null,
    payment_expires_at: null,
    ...patch,
  };
}

function reservation(patch: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    qty: 2,
    unit_price: 90000,
    total_price: 200000,
    options: [{ option_id: "o1", nombre: "Tarjeta 3D", precio: 10000, qty: 1 }],
    expires_at: "2026-11-17T16:00:00+00:00",
    created_at: "2026-11-17T14:59:00+00:00",
    product_variants: { sku: "CRI-001-V01", attributes: { color: "Azul" }, products: { name: "Mariposa monarca" } },
    ...patch,
  };
}

interface Calls {
  created: { preference: CheckoutPreference; key: string }[];
  saved: PaymentLinkToSave[];
}

function deps(
  over: Partial<StartPaymentDeps> & { raw?: unknown } = {},
): { deps: StartPaymentDeps; calls: Calls } {
  const calls: Calls = { created: [], saved: [] };
  const raw = "raw" in over ? over.raw : { order: row(), reservations: [reservation()] };
  return {
    calls,
    deps: {
      loadOrder: async () => raw,
      createPreference: async (preference, key): Promise<CreatePreferenceOutcome> => {
        calls.created.push({ preference, key });
        return { ok: true, preferenceId: "pref-1", initPoint: INIT_POINT };
      },
      savePaymentLink: async (link) => {
        calls.saved.push(link);
        return { ok: true, order_id: link.orderId };
      },
      siteUrl: SITE,
      now: () => NOW,
      ...over,
    },
  };
}

const INPUT = { orderId: ORDER_ID, attemptId: ATTEMPT };

describe("startPayment: happy path", () => {
  it("builds the preference from the server order, stores the link and returns the init point", async () => {
    const { deps: d, calls } = deps();
    const r = await startPayment(INPUT, d);
    assert.deepEqual(r, { ok: true, initPoint: INIT_POINT, reused: false });

    assert.equal(calls.created.length, 1);
    const { preference, key } = calls.created[0];
    assert.equal(preference.external_reference, ORDER_ID);
    assert.equal(preference.items[0].title, "C0002 · Mariposa monarca (Azul) + Tarjeta 3D ×1");
    assert.equal(preference.items[0].unit_price, 100000);
    assert.ok(key.includes(ORDER_ID));

    assert.deepEqual(calls.saved, [
      { orderId: ORDER_ID, preferenceId: "pref-1", initPoint: INIT_POINT, expiresAt: preference.expiration_date_to },
    ]);
  });

  it("retries on a rejected payment with a fresh link", async () => {
    const { deps: d, calls } = deps({ raw: { order: row({ payment_status: "rechazado" }), reservations: [reservation()] } });
    const r = await startPayment(INPUT, d);
    assert.equal(r.ok, true);
    assert.equal(calls.created.length, 1);
  });

  it("accepts an order whose payment status was never set", async () => {
    const { deps: d } = deps({ raw: { order: row({ payment_status: null }), reservations: [reservation()] } });
    assert.equal((await startPayment(INPUT, d)).ok, true);
  });

  it("reads numeric columns sent as strings", async () => {
    const { deps: d } = deps({
      raw: {
        order: row({ total_price: "200000.00", delivery_fee: "12000", grand_total: "212000" }),
        reservations: [reservation({ unit_price: "90000.00", total_price: "200000" })],
      },
    });
    assert.equal((await startPayment(INPUT, d)).ok, true);
  });
});

describe("startPayment: reuse", () => {
  it("reuses a stored link that is still valid instead of creating another preference", async () => {
    const { deps: d, calls } = deps({
      raw: {
        order: row({ init_point: "https://mp.test/pay/old", payment_expires_at: "2026-11-17T15:59:00+00:00" }),
        reservations: [reservation()],
      },
    });
    const r = await startPayment(INPUT, d);
    assert.deepEqual(r, { ok: true, initPoint: "https://mp.test/pay/old", reused: true });
    assert.equal(calls.created.length, 0);
    assert.equal(calls.saved.length, 0);
  });

  it("creates a new preference when the stored link is about to expire", async () => {
    const { deps: d, calls } = deps({
      raw: {
        order: row({ init_point: "https://mp.test/pay/old", payment_expires_at: "2026-11-17T15:01:00+00:00" }),
        reservations: [reservation({ expires_at: "2026-11-17T16:00:00+00:00" })],
      },
    });
    const r = await startPayment(INPUT, d);
    assert.equal(r.ok && r.reused, false);
    assert.equal(calls.created.length, 1);
  });
});

describe("startPayment: order state", () => {
  const expectRoute = async (raw: unknown, kind: string, input: unknown = INPUT) => {
    const { deps: d, calls } = deps({ raw });
    const r = await startPayment(input, d);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.route.kind, kind, JSON.stringify(r.route));
    assert.equal(calls.created.length, 0, "no preference may be created");
    assert.equal(calls.saved.length, 0);
  };

  it("restarts the attempt on unreadable ids", async () => {
    await expectRoute(undefined, "intento", { orderId: "nope", attemptId: ATTEMPT });
    await expectRoute(undefined, "intento", null);
  });

  it("restarts the attempt when the order does not exist or belongs to another attempt", async () => {
    await expectRoute({ order: null, reservations: [] }, "intento");
    await expectRoute({ order: row({ chat_id: "web:0a0a0a0a-2222-4333-8444-555566667777" }), reservations: [reservation()] }, "intento");
    await expectRoute({ order: row({ chat_id: "573001234567" }), reservations: [reservation()] }, "intento");
  });

  it("says the order is already paid", async () => {
    await expectRoute({ order: row({ status: "pagado", payment_status: "aprobado" }), reservations: [] }, "pagado");
  });

  it("restarts the attempt for expired or cancelled orders", async () => {
    await expectRoute({ order: row({ status: "vencido" }), reservations: [] }, "intento");
    await expectRoute({ order: row({ status: "cancelado" }), reservations: [] }, "intento");
  });

  it("restarts the attempt when the reservation ran out (even before the sweep closed the order)", async () => {
    await expectRoute({ order: row(), reservations: [] }, "intento");
    await expectRoute({ order: row(), reservations: [reservation({ expires_at: "2026-11-17T14:59:59Z" })] }, "intento");
    await expectRoute({ order: row(), reservations: [reservation({ expires_at: "2026-11-17T15:02:00Z" })] }, "intento");
  });

  it("never starts a second payment while one is in process (PSE)", async () => {
    // A stored link must not be handed out either.
    await expectRoute(
      {
        order: row({ payment_status: "en_proceso", init_point: "https://mp.test/pay/old", payment_expires_at: "2026-11-17T15:59:00Z" }),
        reservations: [reservation()],
      },
      "en_proceso",
    );
    await expectRoute({ order: row({ payment_status: "comprobante_recibido" }), reservations: [reservation()] }, "en_proceso");
  });

  it("asks to retry on an unknown payment status or an unreadable order", async () => {
    await expectRoute({ order: row({ payment_status: "raro" }), reservations: [reservation()] }, "retry");
    await expectRoute({ order: row({ grand_total: 212000.5 }), reservations: [reservation()] }, "retry");
    await expectRoute("nope", "retry");
  });

  it("refuses to charge when the database totals do not add up", async () => {
    await expectRoute({ order: row({ grand_total: 210000 }), reservations: [reservation()] }, "retry");
  });
});

describe("startPayment: dependencies failing", () => {
  it("asks to retry when the database read fails", async () => {
    const { deps: d } = deps({
      loadOrder: async () => {
        throw new Error("boom");
      },
    });
    const r = await startPayment(INPUT, d);
    assert.equal(!r.ok && r.route.kind, "retry");
  });

  it("asks to retry, without saving anything, when Mercado Pago is down or not configured", async () => {
    for (const outcome of [
      { ok: false, error: "unavailable" },
      { ok: false, error: "not_configured" },
      { ok: false, error: "rejected" },
    ] as CreatePreferenceOutcome[]) {
      const { deps: d, calls } = deps({ createPreference: async () => outcome });
      const r = await startPayment(INPUT, d);
      assert.equal(!r.ok && r.route.kind, "retry", JSON.stringify(outcome));
      assert.equal(calls.saved.length, 0);
    }
    const { deps: d } = deps({
      createPreference: async () => {
        throw new Error("network");
      },
    });
    assert.equal((await startPayment(INPUT, d)).ok, false);
  });

  it("asks to retry when SITE_URL is not configured", async () => {
    const { deps: d, calls } = deps({ siteUrl: undefined });
    const r = await startPayment(INPUT, d);
    assert.equal(!r.ok && r.route.kind, "retry");
    assert.equal(calls.created.length, 0);
  });

  it("does not hand out a link the database refused to store", async () => {
    for (const [answer, kind] of [
      [{ ok: false, error: "PEDIDO_NO_ABIERTO" }, "intento"],
      [{ ok: false, error: "ENLACE_INVALIDO" }, "intento"],
      [{ ok: false, error: "PEDIDO_SIN_LINEAS" }, "intento"],
      [{ ok: false, error: "OTRO" }, "retry"],
      [null, "retry"],
    ] as const) {
      const { deps: d } = deps({ savePaymentLink: async () => answer });
      const r = await startPayment(INPUT, d);
      assert.equal(!r.ok && r.route.kind, kind, JSON.stringify(answer));
    }
    const { deps: d } = deps({
      savePaymentLink: async () => {
        throw new Error("db down");
      },
    });
    const r = await startPayment(INPUT, d);
    assert.equal(!r.ok && r.route.kind, "retry");
  });
});

describe("parsePaymentOrder", () => {
  it("uses the earliest active reservation as the hold end and keeps line order", () => {
    const parsed = parsePaymentOrder({
      order: row({ total_price: 290000, grand_total: 302000 }),
      reservations: [
        reservation({ id: "b", created_at: "2026-11-17T14:59:30Z", expires_at: "2026-11-17T16:05:00Z", qty: 1, unit_price: 90000, total_price: 90000, options: [] }),
        reservation({ id: "a", created_at: "2026-11-17T14:59:00Z", expires_at: "2026-11-17T16:00:00Z" }),
      ],
    });
    assert.equal(parsed.kind, "ok");
    if (parsed.kind !== "ok") return;
    assert.equal(Date.parse(parsed.order.payable.reservationExpiresAt), Date.parse("2026-11-17T16:00:00Z"));
    assert.deepEqual(parsed.order.payable.lines.map((l) => l.totalPrice), [200000, 90000]);
  });

  it("ignores option entries it cannot read instead of blocking the payment", () => {
    const parsed = parsePaymentOrder({
      order: row(),
      reservations: [reservation({ options: [{ nombre: "Tarjeta 3D", precio: 10000, qty: 1 }, { bad: true }, "x"] })],
    });
    assert.equal(parsed.kind === "ok" && parsed.order.payable.lines[0].options.length, 1);
  });

  it("is missing for no order and malformed for garbage", () => {
    assert.equal(parsePaymentOrder({ order: null, reservations: [] }).kind, "missing");
    assert.equal(parsePaymentOrder(null).kind, "malformed");
    assert.equal(parsePaymentOrder({ order: row({ id: 5 }), reservations: [] }).kind, "malformed");
  });
});
