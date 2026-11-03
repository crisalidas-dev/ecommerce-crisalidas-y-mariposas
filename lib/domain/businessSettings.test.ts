import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatSettingsUpdatedAt,
  mapBusinessSettingsDbError,
  parseBusinessSettingsInput,
  toBusinessSettingsUpdate,
} from "./businessSettings.ts";

const VALID = {
  workshopAddress: " Cl. 35cc #8951, Medellín ",
  workshopMapsUrl: "https://maps.app.goo.gl/abc",
  chrysalisWarrantyDays: "30",
  termsUrl: "https://crisalidasymariposas.com/terminos-y-condiciones",
  instagramUrl: "http://instagram.com/crisalidasymariposas",
  facebookLabel: " crisálidas y mariposas ",
  facebookUrl: "",
  website: "www.crisalidasymariposas.com",
  deliveryRouteDepartureText: "1:00 a 1:30 p.m.",
};

describe("parseBusinessSettingsInput", () => {
  it("accepts valid data, trims text and turns an empty Facebook URL into null", () => {
    const r = parseBusinessSettingsInput(VALID);
    assert.ok(r.ok);
    assert.equal(r.data.workshopAddress, "Cl. 35cc #8951, Medellín");
    assert.equal(r.data.facebookLabel, "crisálidas y mariposas");
    assert.equal(r.data.facebookUrl, null);
    assert.equal(r.data.chrysalisWarrantyDays, 30);
  });
  it("keeps a valid Facebook URL", () => {
    const r = parseBusinessSettingsInput({ ...VALID, facebookUrl: "https://facebook.com/x" });
    assert.ok(r.ok);
    assert.equal(r.data.facebookUrl, "https://facebook.com/x");
  });
  it("requires non-empty text fields", () => {
    const r = parseBusinessSettingsInput({ ...VALID, workshopAddress: "  ", facebookLabel: "", deliveryRouteDepartureText: "" });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["deliveryRouteDepartureText", "facebookLabel", "workshopAddress"]);
  });
  it("rejects URLs without http(s) or with spaces", () => {
    const r = parseBusinessSettingsInput({
      ...VALID,
      workshopMapsUrl: "maps.google.com",
      termsUrl: "https://a.com/ b",
      instagramUrl: "ftp://x.com",
      facebookUrl: "facebook.com/x",
    });
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["facebookUrl", "instagramUrl", "termsUrl", "workshopMapsUrl"]);
  });
  it("accepts a website without scheme but rejects spaces", () => {
    assert.ok(parseBusinessSettingsInput({ ...VALID, website: "crisalidasymariposas.com" }).ok);
    const r = parseBusinessSettingsInput({ ...VALID, website: "www.a b.com" });
    assert.ok(!r.ok && "website" in r.errors);
  });
  it("requires warranty days to be a positive integer", () => {
    for (const v of ["0", "-3", "1.5", "abc", ""]) {
      const r = parseBusinessSettingsInput({ ...VALID, chrysalisWarrantyDays: v });
      assert.ok(!r.ok && "chrysalisWarrantyDays" in r.errors, v);
    }
  });
  it("rejects a non-record payload", () => {
    assert.ok(!parseBusinessSettingsInput(null).ok);
  });
});

describe("toBusinessSettingsUpdate", () => {
  it("maps to snake_case columns and stamps the actor, without updated_at", () => {
    const parsed = parseBusinessSettingsInput(VALID);
    assert.ok(parsed.ok);
    const row = toBusinessSettingsUpdate(parsed.data, "a@b.co");
    assert.equal(row.workshop_address, "Cl. 35cc #8951, Medellín");
    assert.equal(row.chrysalis_warranty_days, 30);
    assert.equal(row.facebook_url, null);
    assert.equal(row.updated_by, "a@b.co");
    assert.ok(!("updated_at" in row));
    assert.ok(!("id" in row));
  });
});

describe("mapBusinessSettingsDbError", () => {
  it("maps a named check constraint to its field", () => {
    const r = mapBusinessSettingsDbError({
      code: "23514",
      message: 'new row for relation "business_settings" violates check constraint "business_settings_website_check"',
    });
    assert.equal(r.field, "website");
    assert.ok(r.error.length > 0);
  });
  it("maps the warranty and Maps constraints", () => {
    assert.equal(
      mapBusinessSettingsDbError({ message: 'violates check constraint "business_settings_warranty_days_check"' }).field,
      "chrysalisWarrantyDays",
    );
    assert.equal(
      mapBusinessSettingsDbError({ message: 'violates check constraint "business_settings_workshop_maps_url_check"' }).field,
      "workshopMapsUrl",
    );
  });
  it("explains a missing permission without a field", () => {
    const r = mapBusinessSettingsDbError({ code: "42501", message: "permission denied for table business_settings" });
    assert.equal(r.field, undefined);
    assert.match(r.error, /permiso/i);
  });
  it("falls back to a generic message", () => {
    const r = mapBusinessSettingsDbError({ message: "boom" });
    assert.equal(r.field, undefined);
    assert.match(r.error, /No se pudo guardar/);
  });
});

describe("formatSettingsUpdatedAt", () => {
  it("renders in America/Bogota", () => {
    // 2026-11-03T01:30Z is 20:30 on Nov 2 in Bogota (UTC-5).
    const text = formatSettingsUpdatedAt("2026-11-03T01:30:00Z");
    assert.match(text, /2/);
    assert.match(text, /8:30/);
  });
  it("returns an empty string for invalid input", () => {
    assert.equal(formatSettingsUpdatedAt("nope"), "");
  });
});
