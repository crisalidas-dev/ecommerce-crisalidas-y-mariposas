import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCatalogPdfUpload, type CatalogUploadDeps } from "./catalogPdfUpload.ts";
import { MAX_CATALOG_BYTES } from "../domain/catalogPdf.ts";

const PDF = new TextEncoder().encode("%PDF-1.7\nhello");

function request(file: Blob | null, name = "catalogo.pdf", headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("file", file, name);
  return new Request("http://localhost/admin/api/catalogo-pdf", { method: "POST", body: form, headers });
}

function deps(over: Partial<CatalogUploadDeps> = {}) {
  const calls: { bytes: Uint8Array }[] = [];
  const d: CatalogUploadDeps = {
    authorize: async () => ({ ok: true }),
    upload: async (bytes) => {
      calls.push({ bytes });
      return { ok: true };
    },
    ...over,
  };
  return { d, calls };
}

describe("handleCatalogPdfUpload", () => {
  it("uploads a valid PDF and answers 200", async () => {
    const { d, calls } = deps();
    const res = await handleCatalogPdfUpload(request(new Blob([PDF])), d);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(calls.length, 1);
    assert.deepEqual([...calls[0].bytes], [...PDF]);
  });
  it("returns the guard status and never touches storage when unauthorized", async () => {
    const { d, calls } = deps({ authorize: async () => ({ ok: false, status: 401, error: "Tu sesión expiró." }) });
    const res = await handleCatalogPdfUpload(request(new Blob([PDF])), d);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Tu sesión expiró." });
    assert.equal(calls.length, 0);
  });
  it("rejects a missing file with 400", async () => {
    const { d, calls } = deps();
    const res = await handleCatalogPdfUpload(request(null), d);
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });
  it("rejects non-PDF bytes with 400 even when named .pdf", async () => {
    const { d, calls } = deps();
    const res = await handleCatalogPdfUpload(request(new Blob(["<html>"])), d);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "El archivo no es un PDF válido." });
    assert.equal(calls.length, 0);
  });
  it("rejects a declared body over the limit with 413 before parsing", async () => {
    const { d, calls } = deps();
    const res = await handleCatalogPdfUpload(
      request(new Blob([PDF]), "a.pdf", { "content-length": String(MAX_CATALOG_BYTES + 1024 * 1024) }),
      d,
    );
    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
  });
  it("rejects a file over the limit with 413", async () => {
    const { d, calls } = deps();
    const big = new Uint8Array(MAX_CATALOG_BYTES + 1);
    big.set(PDF);
    const res = await handleCatalogPdfUpload(request(new Blob([big])), d);
    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
  });
  it("answers 502 with a Spanish message when storage fails", async () => {
    const { d } = deps({ upload: async () => ({ ok: false, error: "boom" }) });
    const res = await handleCatalogPdfUpload(request(new Blob([PDF])), d);
    assert.equal(res.status, 502);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false);
    assert.match(body.error, /No se pudo subir el catálogo/);
    assert.match(body.error, /sigue siendo el anterior/);
  });
  it("answers 400 on a body that is not multipart", async () => {
    const { d } = deps();
    const res = await handleCatalogPdfUpload(
      new Request("http://localhost/x", { method: "POST", body: "plain", headers: { "content-type": "text/plain" } }),
      d,
    );
    assert.equal(res.status, 400);
  });
});
