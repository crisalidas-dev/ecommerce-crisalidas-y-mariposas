import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COP_AMOUNT_MAX, caretAfterDigits, formatCopAmount, parseCopAmount } from "./copAmount.ts";

describe("parseCopAmount", () => {
  it("parses plain digits", () => {
    assert.equal(parseCopAmount("150000"), 150000);
  });
  it("ignores thousands separators and any other character", () => {
    assert.equal(parseCopAmount("1.500.000"), 1500000);
    assert.equal(parseCopAmount("$ 1,500,000"), 1500000);
    assert.equal(parseCopAmount("12a3"), 123);
  });
  it("returns null when there are no digits", () => {
    assert.equal(parseCopAmount(""), null);
    assert.equal(parseCopAmount("abc"), null);
    assert.equal(parseCopAmount(" . "), null);
  });
  it("drops leading zeros", () => {
    assert.equal(parseCopAmount("007"), 7);
    assert.equal(parseCopAmount("0"), 0);
    assert.equal(parseCopAmount("000"), 0);
  });
  it("never accepts a sign or decimals: integer COP only", () => {
    assert.equal(parseCopAmount("-5000"), 5000);
    assert.equal(Number.isInteger(parseCopAmount("1500,50")), true);
  });
  it("accepts up to the Postgres integer max and rejects beyond it", () => {
    assert.equal(COP_AMOUNT_MAX, 2_147_483_647);
    assert.equal(parseCopAmount("2147483647"), COP_AMOUNT_MAX);
    assert.equal(parseCopAmount("2147483648"), undefined);
    assert.equal(parseCopAmount("99999999999999999999999"), undefined);
  });
});

describe("formatCopAmount", () => {
  it("groups thousands the es-CO way", () => {
    assert.equal(formatCopAmount(150000), "150.000");
    assert.equal(formatCopAmount(1500000), "1.500.000");
    assert.equal(formatCopAmount(1500), "1.500");
    assert.equal(formatCopAmount(0), "0");
  });
  it("is empty for no value", () => {
    assert.equal(formatCopAmount(null), "");
  });
});

describe("caretAfterDigits", () => {
  it("places the caret after the same number of digits in the formatted text", () => {
    assert.equal(caretAfterDigits("150.000", 3), 3);
    assert.equal(caretAfterDigits("150.000", 4), 5);
    assert.equal(caretAfterDigits("1.500.000", 1), 1);
    assert.equal(caretAfterDigits("1.500.000", 2), 3);
  });
  it("goes to the start for 0 digits and to the end past the last digit", () => {
    assert.equal(caretAfterDigits("150.000", 0), 0);
    assert.equal(caretAfterDigits("150.000", 6), 7);
    assert.equal(caretAfterDigits("150.000", 99), 7);
  });
});
