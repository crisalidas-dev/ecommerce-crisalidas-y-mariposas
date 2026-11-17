import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPaymentId, parsePaymentNotification } from "./paymentNotification.ts";

const q = (s: string) => new URLSearchParams(s);
const BODY = { action: "payment.updated", api_version: "v1", data: { id: "123456" }, type: "payment", live_mode: false };

describe("parsePaymentNotification: payment notifications", () => {
  it("reads type=payment and data.id from the query string (Checkout Pro notification_url)", () => {
    assert.deepEqual(parsePaymentNotification({ query: q("data.id=123456&type=payment"), body: BODY }), {
      kind: "payment",
      paymentId: "123456",
      signedDataId: "123456",
    });
  });

  it("accepts topic=payment as the topic", () => {
    const r = parsePaymentNotification({ query: q("data.id=123456&topic=payment"), body: null });
    assert.equal(r.kind, "payment");
  });

  it("falls back to the JSON body when the query string carries nothing", () => {
    assert.deepEqual(parsePaymentNotification({ query: q(""), body: BODY }), {
      kind: "payment",
      paymentId: "123456",
      signedDataId: null,
    });
  });

  it("reads a numeric data.id from the body", () => {
    const r = parsePaymentNotification({ query: q("type=payment"), body: { type: "payment", data: { id: 123456 } } });
    assert.deepEqual(r, { kind: "payment", paymentId: "123456", signedDataId: null });
  });

  it("flags a body data.id that contradicts the signed query data.id", () => {
    const r = parsePaymentNotification({
      query: q("data.id=123456&type=payment"),
      body: { ...BODY, data: { id: "999999" } },
    });
    assert.deepEqual(r, { kind: "mismatch" });
  });

  it("keeps the query data.id as received, for the signature", () => {
    const r = parsePaymentNotification({ query: q("data.id=ABC&type=payment"), body: null });
    assert.deepEqual(r, { kind: "payment", paymentId: "ABC", signedDataId: "ABC" });
  });
});

describe("parsePaymentNotification: ignored notifications", () => {
  it("ignores other topics such as merchant_order", () => {
    for (const query of ["topic=merchant_order&id=1", "type=merchant_order&data.id=1", "type=plan&data.id=1"]) {
      const r = parsePaymentNotification({ query: q(query), body: null });
      assert.equal(r.kind, "ignored", query);
    }
    const r = parsePaymentNotification({ query: q(""), body: { type: "merchant_order", data: { id: "1" } } });
    assert.equal(r.kind, "ignored");
  });

  it("ignores a notification without any topic", () => {
    assert.equal(parsePaymentNotification({ query: q("data.id=1"), body: null }).kind, "ignored");
    assert.equal(parsePaymentNotification({ query: q(""), body: "not json" }).kind, "ignored");
  });

  it("ignores a payment notification without data.id (unsigned IPN: topic=payment&id=…)", () => {
    const r = parsePaymentNotification({ query: q("topic=payment&id=123456"), body: null });
    assert.equal(r.kind, "ignored");
  });
});

describe("isPaymentId", () => {
  it("accepts Mercado Pago's numeric payment ids only", () => {
    assert.equal(isPaymentId("123456"), true);
    assert.equal(isPaymentId("1325474921"), true);
    for (const id of ["", "abc", "12 3", "-1", "1.5", "0x10", "1".repeat(21), "../1"]) {
      assert.equal(isPaymentId(id), false, id);
    }
  });
});
