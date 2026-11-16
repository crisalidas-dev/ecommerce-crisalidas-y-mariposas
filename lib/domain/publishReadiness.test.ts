import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UNPUBLISHED_NOTICE,
  unpublishedNotice,
  variantAvailabilityLabel,
  variantDeleteBlock,
  variantStatusDisplay,
} from "./publishReadiness.ts";

const variant = (sku: string, overrides: { is_active?: boolean; chrysalisCount?: number | null } = {}) => ({
  sku,
  is_active: true,
  ...overrides,
});

describe("unpublishedNotice", () => {
  it("is null for a published product", () => {
    assert.equal(unpublishedNotice(true, [variant("A-V01")]), null);
  });
  it("is the base notice and never asks for insumos", () => {
    assert.equal(unpublishedNotice(false, [variant("A-V01")]), UNPUBLISHED_NOTICE);
    assert.equal(UNPUBLISHED_NOTICE, "Producto sin publicar: revisa el stock de cada variante y luego publícalo.");
    assert.doesNotMatch(UNPUBLISHED_NOTICE, /insumo/i);
  });
});

describe("variantAvailabilityLabel", () => {
  it("shows the sellable units of the variant", () => {
    assert.equal(variantAvailabilityLabel({ availableUnits: 3 }), "Disponible: 3");
    assert.equal(variantAvailabilityLabel({ availableUnits: 0 }), "Disponible: 0");
  });
});

describe("variantStatusDisplay", () => {
  it("is live green 'Activa' only when the product is published", () => {
    assert.deepEqual(variantStatusDisplay(true, true), {
      label: "Activa",
      action: "Desactivar variante",
      tone: "live",
      note: null,
    });
  });
  it("does not look live while the product is unpublished", () => {
    assert.deepEqual(variantStatusDisplay(false, true), {
      label: "Activa",
      action: "Desactivar variante",
      tone: "muted",
      note: "No visible: el producto no está publicado",
    });
  });
  it("keeps the warning style for an inactive variant", () => {
    assert.deepEqual(variantStatusDisplay(true, false), {
      label: "Inactiva",
      action: "Activar variante",
      tone: "warning",
      note: null,
    });
    assert.equal(variantStatusDisplay(false, false).tone, "warning");
    assert.equal(variantStatusDisplay(false, false).label, "Inactiva");
  });
});

describe("variantDeleteBlock", () => {
  it("allows deleting a variant without history when the product has others", () => {
    assert.equal(variantDeleteBlock({ hasOrderHistory: false }, 2), null);
  });
  it("blocks the only variant, active or not", () => {
    assert.equal(variantDeleteBlock({ hasOrderHistory: false }, 1), "Es la única variante: elimina el producto.");
  });
  it("blocks a variant with orders and points to deactivating it", () => {
    assert.match(variantDeleteBlock({ hasOrderHistory: true }, 3) ?? "", /pedidos.*desactív/i);
  });
});

describe("unpublishedNotice with chrysalis counts", () => {
  const withCount = (sku: string, chrysalisCount: number | null) => variant(sku, { chrysalisCount });
  it("lists active crisalidas variants whose chrysalis count is undefined", () => {
    const text = unpublishedNotice(false, [withCount("A-V01", null), withCount("A-V02", 2)], "crisalidas");
    assert.match(text ?? "", /Crisálidas sin definir: A-V01\./);
    assert.doesNotMatch(text ?? "", /A-V02/);
  });
  it("treats 0 as defined, ignores complementos and inactive variants", () => {
    assert.equal(unpublishedNotice(false, [withCount("A-V01", 0)], "crisalidas"), UNPUBLISHED_NOTICE);
    assert.equal(unpublishedNotice(false, [withCount("A-V01", null)], "complementos"), UNPUBLISHED_NOTICE);
    assert.equal(
      unpublishedNotice(false, [variant("A-V01", { is_active: false, chrysalisCount: null })], "crisalidas"),
      UNPUBLISHED_NOTICE,
    );
  });
});
