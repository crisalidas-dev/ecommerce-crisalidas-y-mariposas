import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rpcErrorMessage, postgrestErrorMessage } from "./stockErrors.ts";

describe("rpcErrorMessage", () => {
  it("traduce códigos conocidos", () => {
    assert.match(rpcErrorMessage("STOCK_NEGATIVO"), /negativ/i);
    assert.match(rpcErrorMessage("SKU_EN_USO"), /SKU/);
  });
  it("traduce los códigos de create_stock_item", () => {
    for (const code of [
      "NOMBRE_REQUERIDO",
      "ORIGEN_INVALIDO",
      "VARIANTE_SOLO_TALLER",
      "SKU_BASE_INVALIDO",
      "SUFIJOS_AGOTADOS",
      "SECUENCIA_AGOTADA",
    ]) {
      assert.doesNotMatch(rpcErrorMessage(code), /No se pudo completar/, code);
    }
  });
  it("traduce los códigos de generación de SKU y nombres de variante", () => {
    for (const code of [
      "VARIANTE_SIN_NOMBRE",
      "NOMBRE_VARIANTE_DUPLICADO",
      "NOMBRE_VARIANTE_LARGO",
      "SIN_VARIANTE_POR_NOMBRAR",
      "ATRIBUTOS_INVALIDOS",
      "STOCK_INVALIDO",
      "PRODUCTO_NO_EXISTE",
      "VARIANTES_AGOTADAS",
      "NOMBRE_REQUERIDO",
      "PRECIO_INVALIDO",
      "LINEA_NO_EXISTE",
      "LINEA_INACTIVA",
      "MARCA_INVALIDA",
      "NOMBRE_SIN_CARACTERES_VALIDOS",
      "SKU_AGOTADO",
    ]) {
      assert.doesNotMatch(rpcErrorMessage(code), /No se pudo completar/, code);
    }
  });
  it("traduce los códigos de simbolismo y nombre corto de create_product_with_variant", () => {
    for (const code of ["NOMBRE_CORTO_LARGO", "NOMBRE_CORTO_REQUERIDO", "SIMBOLISMO_REQUERIDO"]) {
      assert.doesNotMatch(rpcErrorMessage(code), /No se pudo completar/, code);
    }
  });
  it("traduce los códigos de delete_product", () => {
    for (const code of ["PRODUCTO_NO_EXISTE", "PRODUCTO_CON_HISTORIAL"]) {
      assert.doesNotMatch(rpcErrorMessage(code), /No se pudo completar/, code);
    }
  });
  it("traduce los códigos de delete_variant", () => {
    for (const code of ["VARIANTE_NO_EXISTE", "VARIANTE_CON_HISTORIAL", "ULTIMA_VARIANTE"]) {
      assert.doesNotMatch(rpcErrorMessage(code), /No se pudo completar/, code);
    }
  });
  it("usa el mensaje de respaldo o uno genérico para códigos desconocidos", () => {
    assert.equal(rpcErrorMessage("RARO", "del servidor"), "del servidor");
    assert.match(rpcErrorMessage("RARO"), /No se pudo/);
    assert.match(rpcErrorMessage(undefined), /No se pudo/);
  });
});

describe("postgrestErrorMessage", () => {
  it("traduce un P0001 de trigger por su código", () => {
    assert.match(
      postgrestErrorMessage({ code: "P0001", message: "VARIANTE_SIN_NOMBRE", details: "Sin nombre: X." }),
      /nombre/i,
    );
  });
  it("traduce una violación única de línea", () => {
    assert.match(postgrestErrorMessage({ code: "23505", message: "dup" }), /código/i);
  });
  it("cae al mensaje genérico", () => {
    assert.match(postgrestErrorMessage({ code: "XX", message: "boom" }), /No se pudo/);
  });
});
