import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPaymentInfoDbError, parsePaymentInfoInput, toPaymentInfoUpdate } from "./paymentInfo.ts";

const VALID = {
  banco: " Bancolombia ",
  tipoCuenta: "Ahorros",
  numero: " 123-456789-01 ",
  titular: " Nacer Group S.A.S. ",
  nit: "",
  llave: " pagos@nacer.co ",
};

describe("parsePaymentInfoInput", () => {
  it("trims text and turns empty optional fields into null", () => {
    const r = parsePaymentInfoInput(VALID);
    assert.ok(r.ok);
    assert.deepEqual(r.data, {
      banco: "Bancolombia",
      tipoCuenta: "Ahorros",
      numero: "123-456789-01",
      titular: "Nacer Group S.A.S.",
      nit: null,
      llave: "pagos@nacer.co",
    });
  });
  it("keeps optional values when present", () => {
    const r = parsePaymentInfoInput({ ...VALID, nit: " 900.123.456-7 " });
    assert.ok(r.ok);
    assert.equal(r.data.nit, "900.123.456-7");
  });
  it("requires the NOT NULL fields to be non-empty after trim", () => {
    const r = parsePaymentInfoInput({ ...VALID, banco: "  ", tipoCuenta: "", numero: " ", titular: "" });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["banco", "numero", "tipoCuenta", "titular"]);
  });
  it("treats missing keys as empty", () => {
    const r = parsePaymentInfoInput({});
    assert.ok(!r.ok);
    assert.equal(Object.keys(r.errors).length, 4);
  });
  it("rejects non-object input without field errors", () => {
    assert.deepEqual(parsePaymentInfoInput(null), { ok: false, errors: {} });
  });
});

describe("toPaymentInfoUpdate", () => {
  it("maps to the Spanish column names and never touches id or qr_url", () => {
    const r = parsePaymentInfoInput(VALID);
    assert.ok(r.ok);
    const update = toPaymentInfoUpdate(r.data);
    assert.deepEqual(Object.keys(update).sort(), ["banco", "llave", "nit", "numero", "tipo_cuenta", "titular"]);
    assert.equal(update.tipo_cuenta, "Ahorros");
    assert.equal(update.nit, null);
  });
});

describe("mapPaymentInfoDbError", () => {
  it("explains a missing permission", () => {
    assert.match(mapPaymentInfoDbError({ code: "42501", message: "x" }).error, /permiso/);
  });
  it("falls back to a generic message", () => {
    assert.equal(
      mapPaymentInfoDbError({ message: "boom" }).error,
      "No se pudo guardar los cambios. Inténtalo de nuevo.",
    );
  });
});
