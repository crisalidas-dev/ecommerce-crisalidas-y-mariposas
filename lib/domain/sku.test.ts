import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VARIANT_NAME_MAX,
  attributeKeySuggestion,
  brandSkuPrefix,
  canActivateVariant,
  isValidLineCode,
  nextVariantSku,
  normalizeLineCode,
  parseVariantAttributes,
  renamePrefill,
  productSkuPreview,
  skuSlug,
  suggestLineCode,
  unnamedVariantToName,
  variantCardLabel,
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

describe("nextVariantSku", () => {
  it("is the next number after the highest existing variant", () => {
    assert.equal(nextVariantSku("CRI-ARR-PUPAESPECIAL", ["CRI-ARR-PUPAESPECIAL-V01"], 1), "CRI-ARR-PUPAESPECIAL-V02");
  });
  it("never reuses a number of a deleted variant (last_variant_number wins)", () => {
    assert.equal(nextVariantSku("CRI-ARR-X", ["CRI-ARR-X-V01", "CRI-ARR-X-V02"], 3), "CRI-ARR-X-V04");
  });
  it("uses the highest SKU when last_variant_number is behind", () => {
    assert.equal(nextVariantSku("CRI-ARR-X", ["CRI-ARR-X-V01", "CRI-ARR-X-V05"], 0), "CRI-ARR-X-V06");
  });
  it("is null past V99 (VARIANTES_AGOTADAS)", () => {
    assert.equal(nextVariantSku("CRI-ARR-X", ["CRI-ARR-X-V99"], 99), null);
  });
});

describe("attributeKeySuggestion", () => {
  it("takes the attribute key of the first active named variant", () => {
    assert.equal(
      attributeKeySuggestion([
        { is_active: false, attributes: { tamaño: "grande" } },
        { is_active: true, attributes: { color: "blanco" } },
      ]),
      "color",
    );
  });
  it("is empty when no active variant has attributes", () => {
    assert.equal(attributeKeySuggestion([{ is_active: true, attributes: {} }]), "");
    assert.equal(attributeKeySuggestion([{ is_active: true, attributes: null }]), "");
  });
});

const v = (id: string, is_active: boolean, attributes: Record<string, string>) => ({ id, is_active, attributes });

describe("canActivateVariant", () => {
  it("blocks activating an unnamed variant while another variant is active", () => {
    const unnamed = v("1", false, {});
    assert.deepEqual(canActivateVariant(unnamed, [unnamed, v("3", true, { color: "azul" })]), {
      ok: false,
      reason: "Ponle nombre antes de activarla",
    });
  });
  it("allows it when no other variant is active, or when it has a name", () => {
    const unnamed = v("1", false, {});
    assert.deepEqual(canActivateVariant(unnamed, [unnamed, v("3", false, { color: "azul" })]), { ok: true });
    const named = v("1", false, { color: "blanco" });
    assert.deepEqual(canActivateVariant(named, [named, v("3", true, { color: "azul" })]), { ok: true });
  });
  it("never blocks deactivating", () => {
    const active = v("1", true, {});
    assert.deepEqual(canActivateVariant(active, [active, v("3", true, { color: "azul" })]), { ok: true });
  });
});

describe("variantCardLabel", () => {
  it("shows the attributes of a named variant", () => {
    const named = v("1", true, { color: "blanco" });
    assert.deepEqual(variantCardLabel(named, [named]), { text: "color: blanco", unnamed: false });
  });
  it("is 'Variante única' for an unnamed variant with no other active variant", () => {
    const unnamed = v("1", true, {});
    assert.deepEqual(variantCardLabel(unnamed, [unnamed, v("2", false, { color: "azul" })]), {
      text: "Variante única",
      unnamed: true,
    });
  });
  it("is 'Sin nombre' for an unnamed variant next to an active one", () => {
    const unnamed = v("1", false, {});
    assert.deepEqual(variantCardLabel(unnamed, [unnamed, v("3", true, { color: "azul" })]), {
      text: "Sin nombre",
      unnamed: true,
    });
  });
});

describe("parseVariantAttributes", () => {
  it("builds a single-attribute object, trimmed", () => {
    assert.deepEqual(parseVariantAttributes(" color ", " blanco ", {}), { ok: true, attributes: { color: "blanco" } });
  });
  it("clears the name when the value is empty (the trigger decides if that is allowed)", () => {
    assert.deepEqual(parseVariantAttributes("color", "  ", { color: "blanco" }), { ok: true, attributes: {} });
  });
  it("requires the attribute when there is a value", () => {
    const r = parseVariantAttributes(" ", "blanco", {});
    assert.equal(r.ok, false);
  });
  it("caps the value at 20 like the WhatsApp buttons", () => {
    assert.equal(parseVariantAttributes("color", "x".repeat(21), {}).ok, false);
  });
  it("refuses variants that have several attributes instead of dropping them", () => {
    const r = parseVariantAttributes("color", "azul", { color: "blanco", talla: "M" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /varios atributos/);
  });
});

describe("renamePrefill", () => {
  it("uses the variant's own attribute", () => {
    const named = v("1", true, { color: "blanco" });
    assert.deepEqual(renamePrefill(named, [named]), { key: "color", value: "blanco" });
  });
  it("suggests the siblings' key for an unnamed variant", () => {
    const unnamed = v("1", false, {});
    assert.deepEqual(renamePrefill(unnamed, [unnamed, v("3", true, { color: "azul" })]), { key: "color", value: "" });
  });
});
