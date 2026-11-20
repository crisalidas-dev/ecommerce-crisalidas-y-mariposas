import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handlePaymentQrUpload, type PaymentQrUploadDeps } from "./paymentQrUpload.ts";
import { MAX_PAYMENT_QR_BYTES } from "../domain/paymentQr.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function request(file: Blob | null, name = "qr.png", headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.append("file", file, name);
  return new Request("http://localhost/admin/api/qr-pago", { method: "POST", body: form, headers });
}

function deps(over: Partial<PaymentQrUploadDeps> = {}) {
  const calls: { bytes: Uint8Array; contentType: string }[] = [];
  const d: PaymentQrUploadDeps = {
    authorize: async () => ({ ok: true }),
    upload: async (bytes, contentType) => {
      calls.push({ bytes, contentType });
      return { ok: true };
    },
    ...over,
  };
  return { d, calls };
}

describe("handlePaymentQrUpload", () => {
  it("uploads a valid image with the content type from its bytes and answers 200", async () => {
    const { d, calls } = deps();
    const res = await handlePaymentQrUpload(request(new Blob([PNG], { type: "image/jpeg" })), d);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].contentType, "image/png");
    assert.deepEqual([...calls[0].bytes], [...PNG]);
  });
  it("returns the guard status and never touches storage when unauthorized", async () => {
    const { d, calls } = deps({ authorize: async () => ({ ok: false, status: 401, error: "Tu sesión expiró." }) });
    const res = await handlePaymentQrUpload(request(new Blob([PNG])), d);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { ok: false, error: "Tu sesión expiró." });
    assert.equal(calls.length, 0);
  });
  it("rejects a missing file with 400", async () => {
    const { d, calls } = deps();
    assert.equal((await handlePaymentQrUpload(request(null), d)).status, 400);
    assert.equal(calls.length, 0);
  });
  it("rejects non-image bytes with 400 even when named .png", async () => {
    const { d, calls } = deps();
    const res = await handlePaymentQrUpload(request(new Blob(["<html>"]), "qr.png"), d);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "El archivo no es una imagen válida. Usa JPG, PNG o WEBP." });
    assert.equal(calls.length, 0);
  });
  it("rejects a declared body over the limit with 413 before parsing", async () => {
    const { d, calls } = deps();
    const res = await handlePaymentQrUpload(
      request(new Blob([PNG]), "a.png", { "content-length": String(MAX_PAYMENT_QR_BYTES + 1024 * 1024) }),
      d,
    );
    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
  });
  it("rejects a file over the limit with 413", async () => {
    const { d, calls } = deps();
    const big = new Uint8Array(MAX_PAYMENT_QR_BYTES + 1);
    big.set(PNG);
    assert.equal((await handlePaymentQrUpload(request(new Blob([big])), d)).status, 413);
    assert.equal(calls.length, 0);
  });
  it("answers 502 saying the published QR is unchanged when storage fails", async () => {
    const { d } = deps({ upload: async () => ({ ok: false, error: "boom" }) });
    const res = await handlePaymentQrUpload(request(new Blob([PNG])), d);
    assert.equal(res.status, 502);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.match(body.error, /No se pudo subir el QR/);
    assert.match(body.error, /El QR publicado sigue siendo el anterior\./);
  });
  it("does not claim the old QR stays when the image was replaced but the row update failed", async () => {
    const { d } = deps({ upload: async () => ({ ok: false, error: "row", replaced: true }) });
    const res = await handlePaymentQrUpload(request(new Blob([PNG])), d);
    assert.equal(res.status, 502);
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.doesNotMatch(body.error, /sigue siendo el anterior/);
    assert.match(body.error, /imagen sí se reemplazó/);
  });
  it("answers 400 on a body that is not multipart", async () => {
    const { d } = deps();
    const res = await handlePaymentQrUpload(
      new Request("http://localhost/x", { method: "POST", body: "plain", headers: { "content-type": "text/plain" } }),
      d,
    );
    assert.equal(res.status, 400);
  });
});
