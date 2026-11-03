import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CRISALIDAS_PRICE_CEILING, priceCeilingWarning } from "./priceCeiling.ts";

describe("priceCeilingWarning", () => {
  it("warns when a Crisálidas price is above its collection ceiling", () => {
    const warning = priceCeilingWarning("crisalidas", "Pequeños Milagros", 100001);
    assert.match(warning ?? "", /Pequeños Milagros/);
    assert.match(warning ?? "", /100\.000/);
    assert.match(warning ?? "", /se guardó igual/);
  });
  it("accepts a price at the ceiling", () => {
    assert.equal(priceCeilingWarning("crisalidas", "Pequeños Milagros", 100000), null);
  });
  it("has no ceiling for Mariposas de Liberación, no collection or complementos", () => {
    assert.equal(priceCeilingWarning("crisalidas", "Mariposas de Liberación", 9_000_000), null);
    assert.equal(priceCeilingWarning("crisalidas", null, 9_000_000), null);
    assert.equal(priceCeilingWarning("complementos", "Pequeños Milagros", 9_000_000), null);
  });
  it("keeps the four ceilings of spec 001", () => {
    assert.deepEqual(CRISALIDAS_PRICE_CEILING, {
      "Pequeños Milagros": 100000,
      "Instantes de Vida": 200000,
      "Grandes Transformaciones": 300000,
      "Experiencias de Colección": 350000,
    });
  });
});
