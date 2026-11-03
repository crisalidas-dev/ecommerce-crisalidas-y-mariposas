import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeLinesOfBrand, formatLineLabel, parseNewLineInput } from "./productLine.ts";

describe("parseNewLineInput", () => {
  it("accepts a valid line and normalizes the code", () => {
    assert.deepEqual(parseNewLineInput({ brand: "complementos", name: "  Velas ", code: "vel" }), {
      ok: true,
      data: { brand: "complementos", name: "Velas", code: "VEL" },
    });
  });
  it("requires a name", () => {
    const r = parseNewLineInput({ brand: "crisalidas", name: "  ", code: "ABC" });
    assert.equal(r.ok, false);
  });
  it("requires exactly 3 letters", () => {
    assert.equal(parseNewLineInput({ brand: "crisalidas", name: "x", code: "AB" }).ok, false);
    assert.equal(parseNewLineInput({ brand: "crisalidas", name: "x", code: "AB1" }).ok, false);
  });
  it("rejects brands that do not sell", () => {
    assert.equal(parseNewLineInput({ brand: "florea", name: "x", code: "ABC" }).ok, false);
  });
});

describe("lines helpers", () => {
  const lines = [
    { id: "1", brand: "crisalidas", code: "ARR", name: "Arreglos", is_active: true },
    { id: "2", brand: "crisalidas", code: "OLD", name: "Viejo", is_active: false },
    { id: "3", brand: "complementos", code: "PIN", name: "Pines", is_active: true },
  ];
  it("filters active lines of a brand", () => {
    assert.deepEqual(activeLinesOfBrand(lines, "crisalidas").map((l) => l.id), ["1"]);
  });
  it("formats the label", () => {
    assert.equal(formatLineLabel(lines[0]), "Arreglos (ARR)");
  });
});
