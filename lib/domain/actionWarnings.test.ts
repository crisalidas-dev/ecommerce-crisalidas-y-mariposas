import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { combineWarnings } from "./actionWarnings.ts";

describe("combineWarnings", () => {
  it("is null when nothing failed", () => {
    assert.equal(combineWarnings(null, null), null);
    assert.equal(combineWarnings(), null);
  });
  it("keeps a single warning as is", () => {
    assert.equal(combineWarnings(null, "No se pudo subir la foto."), "No se pudo subir la foto.");
  });
  it("joins several warnings in order and ignores blanks", () => {
    assert.equal(combineWarnings("Uno.", "", "  ", "Dos."), "Uno. Dos.");
  });
});
