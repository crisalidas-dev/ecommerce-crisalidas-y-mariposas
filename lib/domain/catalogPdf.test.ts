import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATALOG_CACHE_CONTROL,
  CATALOG_PATH,
  CATALOG_TOO_BIG,
  MAX_CATALOG_BYTES,
  catalogDownloadUrl,
  catalogViewUrl,
  formatCatalogDate,
  formatCatalogSize,
  validateCatalogPdf,
} from "./catalogPdf.ts";

const PDF_HEAD = new TextEncoder().encode("%PDF-1.7\n%....");

describe("catalog constants", () => {
  it("keeps the fixed path the n8n workflow points at", () => {
    assert.equal(CATALOG_PATH, "catalogo/catalogo.pdf");
    assert.equal(MAX_CATALOG_BYTES, 40 * 1024 * 1024);
    assert.equal(CATALOG_TOO_BIG, "El catálogo supera 40 MB.");
    assert.equal(CATALOG_CACHE_CONTROL, "60");
  });
});

describe("validateCatalogPdf", () => {
  it("accepts a file that starts with %PDF-", () => {
    assert.deepEqual(validateCatalogPdf({ name: "catalogo.pdf", size: 4_000_000 }, PDF_HEAD), { ok: true });
  });
  it("accepts exactly 40 MB and rejects one byte more", () => {
    assert.equal(validateCatalogPdf({ name: "a.pdf", size: MAX_CATALOG_BYTES }, PDF_HEAD).ok, true);
    assert.deepEqual(validateCatalogPdf({ name: "a.pdf", size: MAX_CATALOG_BYTES + 1 }, PDF_HEAD), {
      ok: false,
      error: CATALOG_TOO_BIG,
    });
  });
  it("rejects empty files", () => {
    assert.deepEqual(validateCatalogPdf({ name: "a.pdf", size: 0 }, new Uint8Array()), {
      ok: false,
      error: "Selecciona el archivo PDF del catálogo.",
    });
  });
  it("rejects wrong magic bytes even with a .pdf name", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.deepEqual(validateCatalogPdf({ name: "catalogo.pdf", size: 8 }, png), {
      ok: false,
      error: "El archivo no es un PDF válido.",
    });
  });
  it("rejects heads shorter than the signature", () => {
    assert.equal(validateCatalogPdf({ name: "a.pdf", size: 3 }, new Uint8Array([0x25, 0x50, 0x44])).ok, false);
  });
  it("ignores the extension: valid bytes with another name are accepted (magic bytes decide)", () => {
    assert.equal(validateCatalogPdf({ name: "catalogo.bin", size: 100 }, PDF_HEAD).ok, true);
  });
});

describe("formatCatalogSize", () => {
  it("formats bytes as MB with one decimal and a comma", () => {
    assert.equal(formatCatalogSize(4_404_019), "4,2 MB");
    assert.equal(formatCatalogSize(25 * 1024 * 1024), "25,0 MB");
  });
});

describe("formatCatalogDate", () => {
  it("renders in America/Bogota", () => {
    // 2026-11-20T03:30Z is still the 19th at 22:30 in Bogota (UTC-5).
    assert.equal(formatCatalogDate("2026-11-20T03:30:00.000Z"), "19/11/2026 10:30 p. m.");
  });
  it("returns null for missing or invalid dates", () => {
    assert.equal(formatCatalogDate(null), null);
    assert.equal(formatCatalogDate("nope"), null);
  });
});

describe("catalogViewUrl", () => {
  it("appends a cache-busting version", () => {
    assert.equal(catalogViewUrl("https://x/y.pdf", "2026-11-20T03:30:00.000Z"), "https://x/y.pdf?v=2026-11-20T03%3A30%3A00.000Z");
  });
  it("leaves the url untouched without a date", () => {
    assert.equal(catalogViewUrl("https://x/y.pdf", null), "https://x/y.pdf");
  });
});

describe("catalogDownloadUrl", () => {
  it("asks storage to serve the file as an attachment with a friendly name", () => {
    assert.equal(
      catalogDownloadUrl("https://x/y.pdf", "2026-11-20T03:30:00.000Z"),
      "https://x/y.pdf?v=2026-11-20T03%3A30%3A00.000Z&download=Catalogo%20Crisalidas%20y%20Mariposas.pdf",
    );
  });
  it("works without a date", () => {
    assert.equal(
      catalogDownloadUrl("https://x/y.pdf", null),
      "https://x/y.pdf?download=Catalogo%20Crisalidas%20y%20Mariposas.pdf",
    );
  });
});
