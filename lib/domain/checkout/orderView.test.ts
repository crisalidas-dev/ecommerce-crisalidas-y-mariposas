import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBogotaDate, formatBogotaDateTime, isOrderId, parseOrderView, type OrderView } from "./orderView.ts";

const ORDER_ID = "7f1c2b7e-1111-4222-8333-444455556666";
const ATTEMPT = "6f1c2b7e-1111-4222-8333-444455556666";
const NOW = new Date("2026-11-17T15:00:00.000Z");

function orderRow(patch: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    chat_id: `web:${ATTEMPT}`,
    status: "abierto",
    payment_status: "pendiente",
    payment_ref: null,
    paid_amount: null,
    confirmed_at: null,
    human_number: "C0002",
    total_price: "200000.00",
    delivery_fee: "12000.00",
    grand_total: "212000.00",
    delivery_method: "domicilio",
    desired_delivery_date: "2026-11-20",
    created_at: "2026-11-17T14:59:00+00:00",
    ...patch,
  };
}

function line(patch: Record<string, unknown> = {}) {
  return {
    id: "a0000000-0000-4000-8000-000000000001",
    status: "activa",
    qty: 2,
    unit_price: "90000.00",
    total_price: "200000.00",
    options: [{ option_id: "o1", nombre: "Tarjeta 3D", precio: 10000, qty: 1 }],
    expires_at: "2026-11-17T16:00:00+00:00",
    created_at: "2026-11-17T14:59:00+00:00",
    product_variants: { sku: "CRI-001-V01", attributes: { color: "Azul" }, products: { name: "Mariposa monarca" } },
    ...patch,
  };
}

const paidRow = (patch: Record<string, unknown> = {}) =>
  orderRow({
    status: "pagado",
    payment_status: "aprobado",
    payment_ref: "1234567890",
    paid_amount: "212000.00",
    confirmed_at: "2026-11-17T15:30:00+00:00",
    ...patch,
  });

function parse(order: unknown, reservations: unknown[], now = NOW) {
  return parseOrderView({ order, reservations }, now);
}

function okView(order: unknown, reservations: unknown[], now = NOW): OrderView {
  const parsed = parse(order, reservations, now);
  assert.equal(parsed.kind, "ok");
  return (parsed as { kind: "ok"; view: OrderView }).view;
}

describe("isOrderId", () => {
  it("accepts a UUID and nothing else", () => {
    assert.equal(isOrderId(ORDER_ID), true);
    assert.equal(isOrderId("C0002"), false);
    assert.equal(isOrderId(`${ORDER_ID}x`), false);
    assert.equal(isOrderId(""), false);
  });
});

describe("Bogota formatting", () => {
  it("formats an instant in America/Bogota (UTC-5)", () => {
    assert.equal(formatBogotaDateTime("2026-11-17T15:30:00+00:00"), "17 de noviembre de 2026, 10:30 a. m.");
    assert.equal(formatBogotaDateTime("2026-11-17T23:30:00Z"), "17 de noviembre de 2026, 6:30 p. m.");
  });

  it("rolls the day back across midnight UTC", () => {
    assert.equal(formatBogotaDateTime("2026-11-18T04:59:00Z"), "17 de noviembre de 2026, 11:59 p. m.");
    assert.equal(formatBogotaDateTime("2026-11-17T05:00:00Z"), "17 de noviembre de 2026, 12:00 a. m.");
    assert.equal(formatBogotaDateTime("2026-11-17T17:05:00Z"), "17 de noviembre de 2026, 12:05 p. m.");
  });

  it("formats a calendar date with its weekday", () => {
    assert.equal(formatBogotaDate("2026-11-20"), "viernes 20 de noviembre de 2026");
  });

  it("returns null for unreadable input", () => {
    assert.equal(formatBogotaDateTime("nope"), null);
    assert.equal(formatBogotaDate("2026-13-40"), null);
  });
});

describe("parseOrderView: access", () => {
  it("is not_found when the order is missing", () => {
    assert.equal(parseOrderView({ order: null, reservations: [] }, NOW).kind, "not_found");
  });

  it("is not_found for orders that are not web orders", () => {
    assert.equal(parse(orderRow({ chat_id: "573001112233" }), [line()]).kind, "not_found");
    assert.equal(parse(orderRow({ chat_id: "panel:abc" }), [line()]).kind, "not_found");
    assert.equal(parse(orderRow({ chat_id: "" }), [line()]).kind, "not_found");
  });

  it("is malformed for garbage", () => {
    assert.equal(parseOrderView(null, NOW).kind, "malformed");
    assert.equal(parseOrderView([], NOW).kind, "malformed");
    assert.equal(parse(orderRow({ id: 5 }), []).kind, "malformed");
    assert.equal(parse(orderRow({ total_price: "200000.50" }), [line()]).kind, "malformed");
    assert.equal(parse(orderRow(), [line({ qty: 0 })]).kind, "malformed");
    assert.equal(parse(orderRow({ status: "raro" }), [line()]).kind, "malformed");
    assert.equal(parse(orderRow({ payment_status: "raro" }), [line()]).kind, "malformed");
  });
});

describe("parseOrderView: payment state", () => {
  it("paid: status pagado, shows consumed lines only", () => {
    const view = okView(paidRow(), [line({ status: "consumida" }), line({ id: "x", status: "liberada", total_price: "5" })]);
    assert.equal(view.paymentState, "paid");
    assert.equal(view.lines.length, 1);
    assert.equal(view.payment?.reference, "1234567890");
    assert.equal(view.payment?.paidAmount, 212000);
    assert.equal(view.payment?.confirmedAtLabel, "17 de noviembre de 2026, 10:30 a. m.");
  });

  it("paid without consumed lines is inconsistent, never a blank receipt", () => {
    assert.equal(parse(paidRow(), [line({ status: "activa" })]).kind, "inconsistent");
    assert.equal(parse(paidRow(), []).kind, "inconsistent");
  });

  it("paid whose paid_amount differs from the grand total is inconsistent", () => {
    assert.equal(parse(paidRow({ paid_amount: "200000.00" }), [line({ status: "consumida" })]).kind, "inconsistent");
    assert.equal(parse(paidRow({ paid_amount: null }), [line({ status: "consumida" })]).kind, "inconsistent");
  });

  it("pending: open with pendiente or null payment status", () => {
    assert.equal(okView(orderRow({ payment_status: "pendiente" }), [line()]).paymentState, "pending");
    assert.equal(okView(orderRow({ payment_status: null }), [line()]).paymentState, "pending");
    assert.equal(okView(orderRow(), [line()]).payment, null);
  });

  it("processing: en_proceso, comprobante_recibido, or approved before confirm_order ran", () => {
    for (const ps of ["en_proceso", "comprobante_recibido", "aprobado"]) {
      assert.equal(okView(orderRow({ payment_status: ps }), [line()]).paymentState, "processing", ps);
    }
  });

  it("processing stays processing even if the hold lapsed (a payment may be in flight)", () => {
    const later = new Date("2026-11-17T17:00:00Z");
    assert.equal(okView(orderRow({ payment_status: "en_proceso" }), [line()], later).paymentState, "processing");
  });

  it("rejected: open with rechazado", () => {
    assert.equal(okView(orderRow({ payment_status: "rechazado" }), [line()]).paymentState, "rejected");
  });

  it("expired: vencido or cancelado", () => {
    for (const status of ["vencido", "cancelado"]) {
      const view = okView(orderRow({ status }), [line({ status: "expirada" })]);
      assert.equal(view.paymentState, "expired", status);
    }
  });

  it("expired: open with no live lines", () => {
    assert.equal(okView(orderRow(), []).paymentState, "expired");
    assert.equal(okView(orderRow(), [line({ status: "expirada" })]).paymentState, "expired");
    assert.equal(okView(orderRow({ payment_status: "rechazado" }), [line({ status: "liberada" })]).paymentState, "expired");
  });

  it("expired: pending or rejected whose hold already ended by the clock", () => {
    const later = new Date("2026-11-17T16:00:01Z");
    assert.equal(okView(orderRow(), [line()], later).paymentState, "expired");
    assert.equal(okView(orderRow({ payment_status: "rechazado" }), [line()], later).paymentState, "expired");
  });

  it("refunded: reembolsado wins over status", () => {
    const view = okView(paidRow({ payment_status: "reembolsado" }), [line({ status: "consumida" })]);
    assert.equal(view.paymentState, "refunded");
    assert.equal(view.lines.length, 1);
  });

  it("an expired order tolerates lines that no longer add up (they are just hidden)", () => {
    const view = okView(orderRow({ status: "cancelado" }), [line({ status: "liberada", total_price: "1" })]);
    assert.equal(view.paymentState, "expired");
    assert.deepEqual(view.lines, []);
  });
});

describe("parseOrderView: lines and totals", () => {
  it("maps names, variant label, options, quantities and prices", () => {
    const view = okView(orderRow(), [line()]);
    assert.deepEqual(view.lines, [
      {
        productName: "Mariposa monarca",
        variantLabel: "Azul",
        qty: 2,
        unitPrice: 90000,
        totalPrice: 200000,
        options: [{ name: "Tarjeta 3D", qty: 1, unitPrice: 10000 }],
      },
    ]);
    assert.equal(view.subtotal, 200000);
    assert.equal(view.deliveryFee, 12000);
    assert.equal(view.grandTotal, 212000);
    assert.equal(view.humanNumber, "C0002");
  });

  it("keeps creation order across lines", () => {
    const view = okView(orderRow({ total_price: "300000", grand_total: "312000" }), [
      line({ id: "b", created_at: "2026-11-17T15:00:00Z", total_price: "100000", product_variants: { sku: "S2", attributes: {}, products: { name: "Segundo" } } }),
      line({ id: "a", created_at: "2026-11-17T14:00:00Z" }),
    ]);
    assert.deepEqual(view.lines.map((l) => l.productName), ["Mariposa monarca", "Segundo"]);
  });

  it("treats a null delivery fee as zero", () => {
    const view = okView(orderRow({ delivery_fee: null, grand_total: "200000", delivery_method: "tienda" }), [line()]);
    assert.equal(view.deliveryFee, 0);
  });

  it("refuses lines that do not add up to total_price", () => {
    assert.equal(parse(orderRow({ total_price: "199000", grand_total: "211000" }), [line()]).kind, "inconsistent");
  });

  it("refuses a grand total that is not lines plus fee", () => {
    assert.equal(parse(orderRow({ grand_total: "215000" }), [line()]).kind, "inconsistent");
  });
});

describe("parseOrderView: delivery", () => {
  it("shows method and date, never an address", () => {
    const view = okView(orderRow(), [line()]);
    assert.deepEqual(view.delivery, { method: "domicilio", dateLabel: "viernes 20 de noviembre de 2026" });
  });

  it("allows an order without delivery data yet", () => {
    const view = okView(orderRow({ delivery_method: null, desired_delivery_date: null }), [line()]);
    assert.deepEqual(view.delivery, { method: null, dateLabel: null });
  });

  it("formats the order date in Bogota", () => {
    assert.equal(okView(orderRow(), [line()]).createdAtLabel, "17 de noviembre de 2026, 9:59 a. m.");
  });
});

describe("parseOrderView: privacy", () => {
  const FORBIDDEN = /chat|attempt|phone|(^|\.)tel|mail|name_|buyer|recipient|address|direcc|invoice|tax|(^|\.)nit($|\.)|document|legal|sale_details|card_/i;

  function keys(value: unknown, path = ""): string[] {
    if (Array.isArray(value)) return value.flatMap((v) => keys(v, path));
    if (typeof value === "object" && value !== null) {
      return Object.entries(value).flatMap(([k, v]) => [`${path}${k}`, ...keys(v, `${path}${k}.`)]);
    }
    return [];
  }

  it("exposes no personal-data field in any state", () => {
    const views = [
      okView(orderRow(), [line()]),
      okView(paidRow(), [line({ status: "consumida" })]),
      okView(orderRow({ status: "vencido" }), []),
    ];
    for (const view of views) {
      for (const key of keys(view)) assert.doesNotMatch(key, FORBIDDEN, key);
    }
  });

  it("never leaks the web chat id (it embeds the attempt id)", () => {
    const view = okView(paidRow(), [line({ status: "consumida" })]);
    assert.equal(JSON.stringify(view).includes(ATTEMPT), false);
  });
});
