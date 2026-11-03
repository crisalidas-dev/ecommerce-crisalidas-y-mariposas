import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  UNPUBLISHED_NOTICE,
  editableRecipeRows,
  isSelfOnlyVariant,
  unpublishedNotice,
  variantAvailabilityLabel,
  variantDeleteBlock,
  variantStatusDisplay,
} from "./publishReadiness.ts";

const variant = (
  sku: string,
  components: { stockItemId: string; qtyRequired: number }[],
  overrides: { is_active?: boolean; selfItemId?: string | null } = {},
) => ({ sku, is_active: true, selfItemId: `self-${sku}`, components, ...overrides });

describe("isSelfOnlyVariant", () => {
  it("is true when the only component is the variant's own self item", () => {
    assert.equal(isSelfOnlyVariant(variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }])), true);
  });
  it("is false with real components", () => {
    assert.equal(isSelfOnlyVariant(variant("A-V01", [{ stockItemId: "caja", qtyRequired: 1 }])), false);
    assert.equal(
      isSelfOnlyVariant(
        variant("A-V01", [
          { stockItemId: "self-A-V01", qtyRequired: 1 },
          { stockItemId: "caja", qtyRequired: 1 },
        ]),
      ),
      false,
    );
  });
  it("is false without a self item or without components", () => {
    assert.equal(isSelfOnlyVariant(variant("A-V01", [{ stockItemId: "x", qtyRequired: 1 }], { selfItemId: null })), false);
    assert.equal(isSelfOnlyVariant(variant("A-V01", [])), false);
  });
});

describe("unpublishedNotice", () => {
  it("is null for a published product", () => {
    assert.equal(unpublishedNotice(true, [variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }])]), null);
  });
  it("is the base notice when every active variant has its insumos", () => {
    assert.equal(unpublishedNotice(false, [variant("A-V01", [{ stockItemId: "caja", qtyRequired: 1 }])]), UNPUBLISHED_NOTICE);
    assert.equal(UNPUBLISHED_NOTICE, "Producto sin publicar: asigna los insumos de cada variante y luego publícalo.");
  });
  it("names the active variants that still only use their own stock", () => {
    const text = unpublishedNotice(false, [
      variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }]),
      variant("A-V02", [{ stockItemId: "caja", qtyRequired: 1 }]),
      variant("A-V03", [{ stockItemId: "self-A-V03", qtyRequired: 1 }]),
    ]);
    assert.ok(text?.startsWith(UNPUBLISHED_NOTICE));
    assert.match(text ?? "", /A-V01, A-V03/);
    assert.doesNotMatch(text ?? "", /A-V02/);
  });
  it("ignores inactive variants", () => {
    const text = unpublishedNotice(false, [
      variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }], { is_active: false }),
    ]);
    assert.equal(text, UNPUBLISHED_NOTICE);
  });
});

describe("editableRecipeRows", () => {
  it("hides the mirror item: a self-only variant edits an empty recipe", () => {
    assert.deepEqual(editableRecipeRows(variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }])), []);
  });
  it("keeps real components as they are", () => {
    const components = [
      { stockItemId: "caja", qtyRequired: 1 },
      { stockItemId: "crisalida", qtyRequired: 2 },
    ];
    assert.deepEqual(editableRecipeRows(variant("A-V01", components)), components);
  });
});

describe("variantAvailabilityLabel", () => {
  const self = { ...variant("A-V01", [{ stockItemId: "self-A-V01", qtyRequired: 1 }]), availableUnits: 0 };
  it("says no insumos are assigned for a self-only variant, never the mirror as bottleneck", () => {
    assert.equal(variantAvailabilityLabel(self, "encanto (Blanco)"), "Disponible: 0 · sin insumos asignados");
  });
  it("names the bottleneck for a real recipe", () => {
    const v = { ...variant("A-V01", [{ stockItemId: "caja", qtyRequired: 1 }]), availableUnits: 3 };
    assert.equal(variantAvailabilityLabel(v, "Caja kraft"), "Disponible: 3 · limita: Caja kraft");
    assert.equal(variantAvailabilityLabel(v, null), "Disponible: 3");
  });
  it("flags a variant without components", () => {
    const v = { ...variant("A-V01", []), availableUnits: 0 };
    assert.equal(variantAvailabilityLabel(v, null), "Disponible: 0 · sin componentes");
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
  const withCount = (sku: string, chrysalisCount: number | null) => ({
    ...variant(sku, [{ stockItemId: "caja", qtyRequired: 1 }]),
    chrysalisCount,
  });
  it("lists active crisalidas variants whose chrysalis count is undefined", () => {
    const text = unpublishedNotice(false, [withCount("A-V01", null), withCount("A-V02", 2)], "crisalidas");
    assert.match(text ?? "", /Crisálidas sin definir: A-V01\./);
    assert.doesNotMatch(text ?? "", /A-V02/);
  });
  it("treats 0 as defined and ignores complementos", () => {
    assert.equal(unpublishedNotice(false, [withCount("A-V01", 0)], "crisalidas"), UNPUBLISHED_NOTICE);
    assert.equal(unpublishedNotice(false, [withCount("A-V01", null)], "complementos"), UNPUBLISHED_NOTICE);
  });
});
