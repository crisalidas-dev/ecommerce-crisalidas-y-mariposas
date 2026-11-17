import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderView } from "./orderView.ts";
import { RECEIPT_LEGAL_NOTE, buildReceipt, receiptFilename } from "./receipt.ts";

function view(patch: Partial<OrderView> = {}): OrderView {
  return {
    orderId: "7f1c2b7e-1111-4222-8333-444455556666",
    humanNumber: "C0002",
    createdAtLabel: "17 de noviembre de 2026, 9:59 a. m.",
    paymentState: "paid",
    lines: [
      {
        productName: "Mariposa monarca",
        variantLabel: "Azul",
        qty: 2,
        unitPrice: 90000,
        totalPrice: 200000,
        options: [{ name: "Tarjeta 3D", qty: 1, unitPrice: 10000 }],
      },
    ],
    subtotal: 200000,
    deliveryFee: 12000,
    grandTotal: 212000,
    delivery: { method: "domicilio", dateLabel: "viernes 20 de noviembre de 2026" },
    payment: { reference: "1234567890", confirmedAtLabel: "17 de noviembre de 2026, 10:30 a. m.", paidAmount: 212000 },
    ...patch,
  };
}

const BUSINESS = { address: "Calle 10 # 20-30, Medellín", website: "https://nacergroup.co" };

describe("buildReceipt", () => {
  it("builds the receipt of a paid order", () => {
    const receipt = buildReceipt(view(), BUSINESS);
    assert.ok(receipt);
    assert.equal(receipt.humanNumber, "C0002");
    assert.equal(receipt.filename, "comprobante-C0002.pdf");
    assert.equal(receipt.title, "Comprobante de pago");
    assert.equal(receipt.paymentDateLabel, "17 de noviembre de 2026, 10:30 a. m.");
    assert.equal(receipt.paymentReference, "1234567890");
    assert.equal(receipt.paymentSource, "Mercado Pago");
    assert.equal(receipt.subtotal, 200000);
    assert.equal(receipt.deliveryFee, 12000);
    assert.equal(receipt.totalPaid, 212000);
    assert.equal(receipt.legalNote, RECEIPT_LEGAL_NOTE);
  });

  it("carries the legal note verbatim", () => {
    assert.equal(
      RECEIPT_LEGAL_NOTE,
      "Este documento es un comprobante de pago y no constituye factura electrónica de venta.",
    );
  });

  it("describes lines with variant and add-ons", () => {
    const receipt = buildReceipt(view(), BUSINESS);
    assert.deepEqual(receipt?.lines, [
      {
        description: "Mariposa monarca (Azul)",
        details: ["+ Tarjeta 3D × 1"],
        qty: 2,
        unitPrice: 90000,
        totalPrice: 200000,
      },
    ]);
  });

  it("describes delivery without an address", () => {
    assert.equal(buildReceipt(view(), BUSINESS)?.delivery, "Domicilio · viernes 20 de noviembre de 2026");
    assert.equal(
      buildReceipt(view({ delivery: { method: "tienda", dateLabel: null } }), BUSINESS)?.delivery,
      "Recogida en el taller",
    );
    assert.equal(buildReceipt(view({ delivery: { method: null, dateLabel: null } }), BUSINESS)?.delivery, null);
  });

  it("uses the business details it is given and tolerates their absence", () => {
    assert.deepEqual(buildReceipt(view(), BUSINESS)?.businessLines, [
      "Calle 10 # 20-30, Medellín",
      "https://nacergroup.co",
    ]);
    assert.deepEqual(buildReceipt(view(), { address: null, website: null })?.businessLines, []);
    assert.deepEqual(buildReceipt(view(), null)?.businessLines, []);
  });

  it("names the brand", () => {
    assert.equal(buildReceipt(view(), null)?.brand, "Nacer Group — Crisálidas y Mariposas");
  });

  it("is null unless the order is paid", () => {
    for (const paymentState of ["pending", "processing", "rejected", "expired", "refunded"] as const) {
      assert.equal(buildReceipt(view({ paymentState, payment: null }), BUSINESS), null, paymentState);
    }
    assert.equal(buildReceipt(view({ payment: null }), BUSINESS), null);
  });

  it("falls back when the payment has no reference or date", () => {
    const receipt = buildReceipt(
      view({ payment: { reference: null, confirmedAtLabel: null, paidAmount: 212000 } }),
      BUSINESS,
    );
    assert.equal(receipt?.paymentReference, null);
    assert.equal(receipt?.paymentDateLabel, null);
  });

  it("contains no personal-data key", () => {
    const text = JSON.stringify(Object.keys(buildReceipt(view(), BUSINESS) ?? {}));
    assert.doesNotMatch(text, /buyer|recipient|phone|email|address|invoice|chat/i);
  });
});

describe("receiptFilename", () => {
  it("keeps safe characters and drops the rest", () => {
    assert.equal(receiptFilename("C0002"), "comprobante-C0002.pdf");
    assert.equal(receiptFilename('C 00/02"\r\n'), "comprobante-C0002.pdf");
    assert.equal(receiptFilename("../../x"), "comprobante-x.pdf");
  });

  it("falls back when nothing safe is left", () => {
    assert.equal(receiptFilename("***"), "comprobante-pedido.pdf");
  });
});
