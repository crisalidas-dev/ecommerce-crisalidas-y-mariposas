import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldText, searchByText } from "./textSearch.ts";

const items = [
  { sku: "CM0045-01", name: "Matero encanto blanco" },
  { sku: "CM0045-02", name: "Matero encanto azul" },
  { sku: "IC0012", name: "Caja kraft para matero" },
  { sku: "CM0100", name: "Crisálida" },
  { sku: "IC0200", name: "Lazo satinado" },
];
const fields = (i: (typeof items)[number]) => [i.name, i.sku];

describe("foldText", () => {
  it("drops accents and case", () => {
    assert.equal(foldText("Crisálida ÁRBOL"), "crisalida arbol");
  });
});

describe("searchByText", () => {
  it("matches name or SKU ignoring accents and case", () => {
    assert.deepEqual(searchByText(items, "CRISALIDA", fields).map((i) => i.sku), ["CM0100"]);
    assert.deepEqual(searchByText(items, "ic0012", fields).map((i) => i.sku), ["IC0012"]);
  });
  it("matches substrings and requires every word", () => {
    assert.deepEqual(searchByText(items, "ncanto azu", fields).map((i) => i.sku), ["CM0045-02"]);
  });
  it("ranks prefix matches first, then the rest in their original order", () => {
    assert.deepEqual(searchByText(items, "matero", fields).map((i) => i.sku), ["CM0045-01", "CM0045-02", "IC0012"]);
    assert.deepEqual(searchByText(items, "kraft", fields).map((i) => i.sku), ["IC0012"]);
    // No field starts with "a"; "azul" is the only word that does.
    assert.deepEqual(searchByText(items, "a", fields).map((i) => i.sku).slice(0, 1), ["CM0045-02"]);
  });
  it("caps the results", () => {
    assert.equal(searchByText(items, "c", fields, 2).length, 2);
    assert.equal(searchByText(items, "c", fields).length <= 8, true);
  });
  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchByText(items, "   ", fields), []);
  });
});
