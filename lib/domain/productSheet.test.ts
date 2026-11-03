import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SHORT_NAME_MAX,
  firstProductSheetError,
  needsShortName,
  parseProductCopy,
  parseProductName,
  shortNameField,
  productSheetErrors,
  productSheetValues,
  suggestShortName,
  textLength,
} from "./productSheet.ts";

const longName = "Transformación Eterna Azul"; // 26 caracteres

describe("textLength", () => {
  it("counts characters like Postgres char_length, not UTF-16 units", () => {
    assert.equal(textLength("Mariposa"), 8);
    assert.equal(textLength("🦋🦋"), 2);
  });
});

describe("needsShortName", () => {
  it("is false when the trimmed name fits in 20", () => {
    assert.equal(SHORT_NAME_MAX, 20);
    assert.equal(needsShortName("Encanto"), false);
    assert.equal(needsShortName("x".repeat(20)), false);
    assert.equal(needsShortName(`  ${"x".repeat(20)}  `), false);
  });
  it("is true past 20 characters", () => {
    assert.equal(needsShortName("x".repeat(21)), true);
    assert.equal(needsShortName(longName), true);
  });
});

describe("productSheetErrors", () => {
  it("accepts a crisalidas product with simbolismo and a name that fits", () => {
    assert.deepEqual(
      productSheetErrors({ brand: "crisalidas", name: "Encanto", simbolismo: "Renacer.", shortName: "" }),
      { simbolismo: null, shortName: null },
    );
  });
  it("requires simbolismo for crisalidas", () => {
    const errors = productSheetErrors({ brand: "crisalidas", name: "Encanto", simbolismo: "   ", shortName: "" });
    assert.match(errors.simbolismo ?? "", /simbolismo/i);
  });
  it("does not require simbolismo for complementos", () => {
    const errors = productSheetErrors({ brand: "complementos", name: "PIN Mariposa", simbolismo: "", shortName: "" });
    assert.equal(errors.simbolismo, null);
  });
  it("requires a short name when the name is longer than 20", () => {
    const errors = productSheetErrors({ brand: "complementos", name: longName, simbolismo: "", shortName: " " });
    assert.match(errors.shortName ?? "", /nombre corto/i);
  });
  it("accepts a short name of exactly 20", () => {
    const errors = productSheetErrors({
      brand: "crisalidas",
      name: longName,
      simbolismo: "Renacer.",
      shortName: "x".repeat(20),
    });
    assert.equal(errors.shortName, null);
  });
  it("rejects a short name longer than 20, even when the name fits", () => {
    const errors = productSheetErrors({
      brand: "crisalidas",
      name: "Encanto",
      simbolismo: "Renacer.",
      shortName: "x".repeat(21),
    });
    assert.match(errors.shortName ?? "", /máximo 20/);
  });
  it("tolerates missing optional values", () => {
    assert.deepEqual(productSheetErrors({ brand: "complementos", name: "PIN" }), { simbolismo: null, shortName: null });
  });
});

describe("firstProductSheetError", () => {
  it("returns null when everything is valid", () => {
    assert.equal(firstProductSheetError({ simbolismo: null, shortName: null }), null);
  });
  it("returns the short-name error before the simbolismo error", () => {
    assert.equal(firstProductSheetError({ simbolismo: "s", shortName: "n" }), "n");
    assert.equal(firstProductSheetError({ simbolismo: "s", shortName: null }), "s");
  });
});

describe("productSheetValues", () => {
  it("trims both values and turns blanks into null", () => {
    assert.deepEqual(
      productSheetValues({ brand: "crisalidas", name: longName, simbolismo: "  Renacer.  ", shortName: "  Eterna Azul " }),
      { simbolismo: "Renacer.", shortName: "Eterna Azul" },
    );
    assert.deepEqual(productSheetValues({ brand: "crisalidas", name: "Encanto", simbolismo: " ", shortName: "" }), {
      simbolismo: null,
      shortName: null,
    });
  });
  it("drops simbolismo for complementos", () => {
    assert.deepEqual(
      productSheetValues({ brand: "complementos", name: "PIN", simbolismo: "No aplica", shortName: "" }),
      { simbolismo: null, shortName: null },
    );
  });
});

describe("suggestShortName", () => {
  it("is not needed when the trimmed name fits in 20", () => {
    assert.equal(suggestShortName("Encanto"), null);
    assert.equal(suggestShortName(`  ${"x".repeat(20)}  `), null);
    assert.equal(suggestShortName(""), null);
  });
  it("cuts at the last full word and drops a trailing connector", () => {
    assert.equal(suggestShortName("Experiencias de Colección"), "Experiencias");
  });
  it("keeps every word that fits", () => {
    assert.equal(suggestShortName("Gratitud Mascotas de la Casa"), "Gratitud Mascotas");
    assert.equal(suggestShortName("Flores de la Montaña Alta"), "Flores de la Montaña");
  });
  it("hard-cuts a first word longer than 20", () => {
    const word = "Supercalifragilístico".padEnd(25, "s");
    assert.equal(suggestShortName(word), word.slice(0, 20));
    assert.equal(textLength(suggestShortName(word) ?? ""), 20);
  });
  it("collapses repeated spaces before measuring", () => {
    assert.equal(suggestShortName("  Mariposa    Azul     Eterna   de   Luz  "), "Mariposa Azul Eterna");
  });
  it("drops trailing connectors such as y and de, in any case", () => {
    assert.equal(suggestShortName("Orquídea Blanca y Dos Tallos"), "Orquídea Blanca");
    assert.equal(suggestShortName("Ramo Rosado DE Mariposas"), "Ramo Rosado");
    assert.equal(suggestShortName("Flores de la Montañas Altas"), "Flores");
  });
  it("never returns an empty string when the name has letters", () => {
    const suggestion = suggestShortName("de la de la de la de la");
    assert.ok(suggestion && suggestion.length > 0);
    assert.ok(textLength(suggestion) <= 20);
  });
  it("always fits in SHORT_NAME_MAX", () => {
    for (const name of ["Experiencias de Colección", "Gratitud para las Mascotas de la Casa", "a".repeat(40)]) {
      assert.ok(textLength(suggestShortName(name) ?? "") <= SHORT_NAME_MAX, name);
    }
  });
});

describe("parseProductCopy", () => {
  it("trims both fields for crisalidas", () => {
    assert.deepEqual(parseProductCopy("crisalidas", { description: "  Una caja.  ", simbolismo: "  Renacer. " }), {
      ok: true,
      data: { description: "Una caja.", simbolismo: "Renacer." },
    });
  });
  it("turns a blank description into null", () => {
    assert.deepEqual(parseProductCopy("crisalidas", { description: "   ", simbolismo: "Renacer." }), {
      ok: true,
      data: { description: null, simbolismo: "Renacer." },
    });
  });
  it("refuses to empty simbolismo on a crisalidas product", () => {
    const r = parseProductCopy("crisalidas", { description: "Una caja.", simbolismo: "  " });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /simbolismo/i);
  });
  it("stores null simbolismo for complementos whatever is sent", () => {
    assert.deepEqual(parseProductCopy("complementos", { description: "Chocolates", simbolismo: "No aplica" }), {
      ok: true,
      data: { description: "Chocolates", simbolismo: null },
    });
    assert.deepEqual(parseProductCopy("complementos", { description: "", simbolismo: undefined }), {
      ok: true,
      data: { description: null, simbolismo: null },
    });
  });
});

describe("parseProductName", () => {
  it("trims the name and drops the short name when the name fits in 20", () => {
    assert.deepEqual(parseProductName("  Encanto  ", "Algo"), { ok: true, data: { name: "Encanto", shortName: null } });
  });
  it("requires the name", () => {
    const r = parseProductName("   ", "");
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /nombre/i);
  });
  it("keeps a trimmed short name for a long name", () => {
    assert.deepEqual(parseProductName("Experiencias de Colección", "  Experiencias "), {
      ok: true,
      data: { name: "Experiencias de Colección", shortName: "Experiencias" },
    });
  });
  it("requires a short name for a long name and caps it at 20", () => {
    const missing = parseProductName("Experiencias de Colección", " ");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /nombre corto/i);
    const long = parseProductName("Experiencias de Colección", "x".repeat(21));
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.error, /máximo 20/);
  });
});

describe("shortNameField", () => {
  it("is hidden when the name fits in 20", () => {
    assert.deepEqual(shortNameField("Encanto", null), { show: false, value: "" });
    assert.deepEqual(shortNameField("Encanto", "Algo"), { show: false, value: "" });
  });
  it("follows the suggestion until the user edits it", () => {
    assert.deepEqual(shortNameField("Experiencias de Colección", null), { show: true, value: "Experiencias" });
    assert.deepEqual(shortNameField("Experiencias de Colección", "Colección"), { show: true, value: "Colección" });
  });
});
