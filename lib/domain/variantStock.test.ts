import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VARIANT_STOCK_MAX, parseVariantStock } from "./variantStock.ts";

describe("parseVariantStock", () => {
  it("accepts integers from 0 up to the max", () => {
    assert.deepEqual(parseVariantStock("0"), { ok: true, value: 0 });
    assert.deepEqual(parseVariantStock(" 12 "), { ok: true, value: 12 });
    assert.deepEqual(parseVariantStock(5), { ok: true, value: 5 });
    assert.deepEqual(parseVariantStock(String(VARIANT_STOCK_MAX)), { ok: true, value: VARIANT_STOCK_MAX });
  });
  it("treats an empty value as 0 (initial stock is optional)", () => {
    assert.deepEqual(parseVariantStock(""), { ok: true, value: 0 });
    assert.deepEqual(parseVariantStock(undefined), { ok: true, value: 0 });
    assert.deepEqual(parseVariantStock(null), { ok: true, value: 0 });
  });
  it("rejects negatives, decimals, text and values above the max", () => {
    for (const raw of ["-1", "1.5", "abc", "1e3", String(VARIANT_STOCK_MAX + 1), Number.NaN, -3, 2.5]) {
      const r = parseVariantStock(raw);
      assert.equal(r.ok, false, String(raw));
      if (!r.ok) assert.match(r.error, /stock/i);
    }
  });
});
