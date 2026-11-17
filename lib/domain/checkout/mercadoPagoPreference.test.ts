import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXCLUDED_PAYMENT_TYPES,
  MERCADOPAGO_WEBHOOK_PATH,
  buildPreference,
  formatBogotaIso,
  orderPagePath,
  parsePreferenceResponse,
  type PayableOrder,
} from "./mercadoPagoPreference.ts";

const ORDER_ID = "7f1c2b7e-1111-4222-8333-444455556666";
const SITE = "https://tienda.nacergroup.co";
const NOW = new Date("2026-11-17T15:00:00.000Z");
// Reservation ends 60 min after NOW.
const RESERVATION_END = "2026-11-17T16:00:00+00:00";

function order(patch: Partial<PayableOrder> = {}): PayableOrder {
  return {
    orderId: ORDER_ID,
    humanNumber: "C0002",
    subtotal: 180000,
    deliveryFee: 12000,
    grandTotal: 192000,
    reservationExpiresAt: RESERVATION_END,
    lines: [
      {
        variantSku: "CRI-001-V01",
        productName: "Mariposa monarca",
        variantLabel: "Azul",
        qty: 2,
        unitPrice: 90000,
        totalPrice: 180000,
        options: [],
      },
    ],
    ...patch,
  };
}

function built(o: PayableOrder = order()) {
  const r = buildPreference(o, { siteUrl: SITE, now: NOW });
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) throw new Error("unreachable");
  return r;
}

const itemsTotal = (items: { quantity: number; unit_price: number }[]) =>
  items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

describe("buildPreference: identity and routing", () => {
  it("uses the order id as external_reference and tags the source as web", () => {
    const { preference } = built();
    assert.equal(preference.external_reference, ORDER_ID);
    assert.deepEqual(preference.metadata, { source: "web", order_id: ORDER_ID });
  });

  it("notifies the store's own webhook", () => {
    const { preference } = built();
    assert.equal(MERCADOPAGO_WEBHOOK_PATH, "/api/webhooks/mercadopago");
    assert.equal(preference.notification_url, `${SITE}/api/webhooks/mercadopago`);
  });

  it("returns to the order page on every outcome and auto-returns only when approved", () => {
    const { preference } = built();
    const page = `${SITE}${orderPagePath(ORDER_ID)}`;
    assert.deepEqual(preference.back_urls, { success: page, pending: page, failure: page });
    assert.equal(preference.auto_return, "approved");
  });

  it("does not double the slash when SITE_URL ends with one", () => {
    const r = buildPreference(order(), { siteUrl: `${SITE}/`, now: NOW });
    assert.equal(r.ok && r.preference.notification_url, `${SITE}/api/webhooks/mercadopago`);
  });

  it("refuses a SITE_URL that is missing, relative or not HTTPS", () => {
    for (const siteUrl of [undefined, "", "tienda.nacergroup.co", "http://tienda.nacergroup.co", "ftp://x.co"]) {
      const r = buildPreference(order(), { siteUrl, now: NOW });
      assert.deepEqual(r, { ok: false, error: "invalid_site_url" }, String(siteUrl));
    }
  });

  it("brands the card statement", () => {
    assert.equal(built().preference.statement_descriptor, "NACER GROUP");
  });
});

describe("buildPreference: payment methods", () => {
  it("excludes cash and offline types so only card and PSE remain", () => {
    assert.deepEqual([...EXCLUDED_PAYMENT_TYPES], ["ticket", "atm"]);
    const { preference } = built();
    assert.deepEqual(preference.payment_methods.excluded_payment_types, [{ id: "ticket" }, { id: "atm" }]);
  });

  it("never excludes PSE (bank_transfer) nor cards", () => {
    const ids = built().preference.payment_methods.excluded_payment_types.map((t) => t.id);
    for (const kept of ["bank_transfer", "credit_card", "debit_card", "prepaid_card"]) {
      assert.equal(ids.includes(kept as never), false, kept);
    }
  });
});

describe("buildPreference: items and totals", () => {
  it("has one item per line and a delivery item, summing exactly the grand total", () => {
    const { preference } = built();
    assert.deepEqual(preference.items, [
      {
        id: "CRI-001-V01",
        title: "C0002 · Mariposa monarca (Azul)",
        quantity: 2,
        unit_price: 90000,
        currency_id: "COP",
      },
      { id: "ENVIO", title: "C0002 · Domicilio", quantity: 1, unit_price: 12000, currency_id: "COP" },
    ]);
    assert.equal(itemsTotal(preference.items), 192000);
  });

  it("has no delivery item for pickup (fee 0)", () => {
    const { preference } = built(order({ deliveryFee: 0, grandTotal: 180000 }));
    assert.equal(preference.items.length, 1);
    assert.equal(preference.items.some((i) => i.id === "ENVIO"), false);
  });

  it("shows the human order number in every item title", () => {
    for (const item of built().preference.items) assert.match(item.title, /^C0002 · /);
  });

  it("folds per-unit options into the line price and names them in the title", () => {
    const o = order({
      subtotal: 200000,
      grandTotal: 212000,
      lines: [
        {
          variantSku: "CRI-001-V01",
          productName: "Mariposa monarca",
          variantLabel: "",
          qty: 2,
          unitPrice: 90000,
          totalPrice: 200000,
          options: [{ name: "Tarjeta 3D", qty: 1, unitPrice: 10000 }],
        },
      ],
    });
    const [line] = built(o).preference.items;
    assert.equal(line.quantity, 2);
    assert.equal(line.unit_price, 100000);
    assert.equal(line.title, "C0002 · Mariposa monarca + Tarjeta 3D ×1");
    assert.equal(itemsTotal(built(o).preference.items), 212000);
  });

  it("charges a line as one item when its total does not split evenly per unit", () => {
    const o = order({
      subtotal: 280000,
      grandTotal: 280000,
      deliveryFee: 0,
      lines: [
        {
          variantSku: "CRI-002-V01",
          productName: "Cofre",
          variantLabel: "",
          qty: 3,
          unitPrice: 90000,
          totalPrice: 280000,
          options: [{ name: "Chocolates x 9", qty: 1, unitPrice: 10000 }],
        },
      ],
    });
    const [line] = built(o).preference.items;
    assert.deepEqual(
      { quantity: line.quantity, unit_price: line.unit_price, title: line.title },
      { quantity: 1, unit_price: 280000, title: "C0002 · 3 × Cofre + Chocolates x 9 ×1" },
    );
  });

  it("only ever sends integer COP", () => {
    for (const item of built().preference.items) {
      assert.equal(Number.isSafeInteger(item.unit_price), true);
      assert.equal(Number.isSafeInteger(item.quantity), true);
      assert.equal(item.currency_id, "COP");
    }
  });

  it("refuses fractional, negative or zero amounts", () => {
    const bad: Partial<PayableOrder>[] = [
      { grandTotal: 192000.5 },
      { deliveryFee: -1, grandTotal: 179999 },
      { lines: [{ ...order().lines[0], totalPrice: 180000.25 }] },
      { lines: [{ ...order().lines[0], qty: 0 }] },
      { lines: [{ ...order().lines[0], unitPrice: 0, totalPrice: 0 }], subtotal: 0, grandTotal: 12000 },
    ];
    for (const patch of bad) {
      const r = buildPreference(order(patch), { siteUrl: SITE, now: NOW });
      assert.deepEqual(r, { ok: false, error: "invalid_amount" }, JSON.stringify(patch));
    }
  });

  it("refuses a line priced below its units (options never subtract)", () => {
    const r = buildPreference(order({ lines: [{ ...order().lines[0], totalPrice: 170000 }], subtotal: 170000, grandTotal: 182000 }), {
      siteUrl: SITE,
      now: NOW,
    });
    assert.deepEqual(r, { ok: false, error: "invalid_amount" });
  });

  it("refuses when the items do not add up to the grand total", () => {
    for (const patch of [{ grandTotal: 191000 }, { subtotal: 170000 }, { deliveryFee: 15000 }]) {
      const r = buildPreference(order(patch), { siteUrl: SITE, now: NOW });
      assert.deepEqual(r, { ok: false, error: "total_mismatch" }, JSON.stringify(patch));
    }
  });

  it("refuses an order without lines", () => {
    const r = buildPreference(order({ lines: [], subtotal: 0, grandTotal: 12000 }), { siteUrl: SITE, now: NOW });
    assert.deepEqual(r, { ok: false, error: "no_lines" });
  });

  it("keeps titles within Mercado Pago's length limit", () => {
    const long = order({ lines: [{ ...order().lines[0], productName: "M".repeat(400) }] });
    for (const item of built(long).preference.items) assert.ok(item.title.length <= 256);
  });
});

describe("buildPreference: expiry", () => {
  it("expires one minute before the reservation, in Bogota time with offset", () => {
    const r = built();
    assert.equal(r.preference.expires, true);
    assert.equal(r.preference.expiration_date_to, "2026-11-17T10:59:00.000-05:00");
    assert.equal(r.linkExpiresAt, "2026-11-17T10:59:00.000-05:00");
    assert.equal(Date.parse(r.linkExpiresAt), Date.parse(RESERVATION_END) - 60_000);
  });

  it("refuses when the reservation leaves no time to pay", () => {
    for (const end of ["2026-11-17T15:02:30Z", "2026-11-17T15:00:00Z", "2026-11-17T14:00:00Z", "mañana"]) {
      const r = buildPreference(order({ reservationExpiresAt: end }), { siteUrl: SITE, now: NOW });
      assert.deepEqual(r, { ok: false, error: "expired" }, end);
    }
  });

  it("formats any instant as Bogota wall time with a -05:00 offset", () => {
    assert.equal(formatBogotaIso(new Date("2026-01-01T03:04:05.006Z")), "2025-12-31T22:04:05.006-05:00");
  });
});

describe("buildPreference: idempotency key", () => {
  it("is stable for the same order, total and link expiry", () => {
    assert.equal(built().idempotencyKey, built().idempotencyKey);
    assert.ok(built().idempotencyKey.includes(ORDER_ID));
    assert.ok(built().idempotencyKey.length <= 64);
  });

  it("changes when the total or the expiry change", () => {
    const base = built().idempotencyKey;
    const otherTotal = built(order({ deliveryFee: 15000, grandTotal: 195000 })).idempotencyKey;
    const otherExpiry = built(order({ reservationExpiresAt: "2026-11-17T16:10:00Z" })).idempotencyKey;
    assert.notEqual(base, otherTotal);
    assert.notEqual(base, otherExpiry);
  });
});

describe("parsePreferenceResponse", () => {
  it("reads id and init_point", () => {
    assert.deepEqual(
      parsePreferenceResponse({ id: "123-abc", init_point: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=123-abc", sandbox_init_point: "https://sandbox.x" }),
      { ok: true, preferenceId: "123-abc", initPoint: "https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=123-abc" },
    );
  });

  it("is malformed without an id or an HTTPS init_point", () => {
    for (const raw of [null, "x", {}, { id: "1" }, { id: "1", init_point: "http://insecure" }, { id: "", init_point: "https://x" }]) {
      assert.deepEqual(parsePreferenceResponse(raw), { ok: false }, JSON.stringify(raw));
    }
  });
});
