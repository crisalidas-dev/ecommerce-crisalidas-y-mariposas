import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VARIANT_NAME_MAX,
  brandSkuPrefix,
  isValidLineCode,
  normalizeLineCode,
  productSkuPreview,
  skuSlug,
  suggestLineCode,
  unnamedVariantToName,
  variantDisplayName,
  variantNameError,
  variantSkuPreview,
} from "./sku.ts";

describe("skuSlug", () => {
  it("strips accents, uppercases and keeps only A-Z0-9", () => {
    assert.equal(skuSlug("Encanto"), "ENCANTO");
    assert.equal(skuSlug("Mariposa Malva"), "MARIPOSAMALV");
    assert.equal(skuSlug("Ñandú & Co."), "NANDUCO");
  });
  it("cuts at 12 characters", () => {
    assert.equal(skuSlug("Transformación Eterna Azul"), "TRANSFORMACI");
  });
  it("returns empty when nothing survives", () => {
    assert.equal(skuSlug("¡¿ ?!"), "");
  });
});

describe("brandSkuPrefix", () => {
  it("maps the two selling brands", () => {
    assert.equal(brandSkuPrefix("crisalidas"), "CRI");
    assert.equal(brandSkuPrefix("complementos"), "COM");
  });
  it("returns null for any other brand", () => {
    assert.equal(brandSkuPrefix("florea"), null);
  });
});

describe("productSkuPreview / variantSkuPreview", () => {
  it("composes prefix, line code and slug", () => {
    assert.equal(productSkuPreview("crisalidas", "ARR", "Encanto"), "CRI-ARR-ENCANTO");
    assert.equal(productSkuPreview("complementos", "PIN", "Mariposa Malva"), "COM-PIN-MARIPOSAMALV");
  });
  it("is null while a piece is missing", () => {
    assert.equal(productSkuPreview("crisalidas", "", "Encanto"), null);
    assert.equal(productSkuPreview("crisalidas", "ARR", "  "), null);
    assert.equal(productSkuPreview("florea", "ARR", "x"), null);
  });
  it("appends a zero-padded variant number", () => {
    assert.equal(variantSkuPreview("CRI-ARR-ENCANTO"), "CRI-ARR-ENCANTO-V01");
    assert.equal(variantSkuPreview("CRI-ARR-ENCANTO", 7), "CRI-ARR-ENCANTO-V07");
    assert.equal(variantSkuPreview(null), null);
  });
});

describe("line codes", () => {
  it("normalizes to uppercase A-Z, max 3", () => {
    assert.equal(normalizeLineCode("ár1r-x"), "ARR");
    assert.equal(normalizeLineCode("a"), "A");
  });
  it("validates exactly 3 letters", () => {
    assert.equal(isValidLineCode("ARR"), true);
    assert.equal(isValidLineCode("AR"), false);
    assert.equal(isValidLineCode("ar1"), false);
  });
  it("suggests the first 3 letters of the name", () => {
    assert.equal(suggestLineCode("Arreglos"), "ARR");
    assert.equal(suggestLineCode("Ósculos"), "OSC");
    assert.equal(suggestLineCode("12 Pines"), "PIN");
    assert.equal(suggestLineCode("A"), "A");
    assert.equal(suggestLineCode(""), "");
  });
});

describe("variantDisplayName", () => {
  it("joins trimmed non-blank values with a space", () => {
    assert.equal(variantDisplayName({ color: " Azul ", talla: "M" }), "Azul M");
  });
  it("is null with no usable value", () => {
    assert.equal(variantDisplayName({}), null);
    assert.equal(variantDisplayName({ color: "  " }), null);
    assert.equal(variantDisplayName(null), null);
  });
});

describe("variantNameError", () => {
  it("accepts up to the limit and blank", () => {
    assert.equal(VARIANT_NAME_MAX, 20);
    assert.equal(variantNameError("a".repeat(20)), null);
    assert.equal(variantNameError(""), null);
  });
  it("rejects more than 20 characters after trimming", () => {
    assert.match(variantNameError("a".repeat(21)) ?? "", /20/);
    assert.equal(variantNameError("  " + "a".repeat(20) + "  "), null);
  });
});

describe("unnamedVariantToName", () => {
  it("returns the lone active unnamed variant", () => {
    const v = { id: "1", is_active: true, attributes: {} };
    assert.equal(unnamedVariantToName([v]), v);
  });
  it("ignores inactive variants when counting", () => {
    const v = { id: "1", is_active: true, attributes: {} };
    const off = { id: "2", is_active: false, attributes: { color: "x" } };
    assert.equal(unnamedVariantToName([v, off]), v);
  });
  it("is null when the lone variant already has a name, or there are 2+ or none", () => {
    assert.equal(unnamedVariantToName([{ id: "1", is_active: true, attributes: { color: "Azul" } }]), null);
    assert.equal(
      unnamedVariantToName([
        { id: "1", is_active: true, attributes: {} },
        { id: "2", is_active: true, attributes: { color: "Azul" } },
      ]),
      null,
    );
    assert.equal(unnamedVariantToName([]), null);
  });
});
