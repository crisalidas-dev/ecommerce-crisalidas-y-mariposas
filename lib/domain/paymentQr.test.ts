import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_PAYMENT_QR_BYTES,
  PAYMENT_QR_DEFAULT_PATH,
  PAYMENT_QR_TOO_BIG,
  detectQrImage,
  paymentQrViewUrl,
  resolveQrTarget,
  validatePaymentQr,
} from "./paymentQr.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\x24\x00\x00\x00WEBPVP8 ");
const PDF = new TextEncoder().encode("%PDF-1.7\n%....");
const SB = "https://abc.supabase.co";

describe("constants", () => {
  it("keeps the bucket and fallback path other consumers read", () => {
    assert.equal(PAYMENT_QR_DEFAULT_PATH, "llave.jpeg");
    assert.equal(MAX_PAYMENT_QR_BYTES, 5 * 1024 * 1024);
    assert.equal(PAYMENT_QR_TOO_BIG, "El QR supera 5 MB.");
  });
});

describe("detectQrImage", () => {
  it("detects JPEG, PNG and WebP by magic bytes", () => {
    assert.equal(detectQrImage(JPEG), "image/jpeg");
    assert.equal(detectQrImage(PNG), "image/png");
    assert.equal(detectQrImage(WEBP), "image/webp");
  });
  it("rejects other formats, RIFF that is not WebP and short heads", () => {
    assert.equal(detectQrImage(PDF), null);
    assert.equal(detectQrImage(new TextEncoder().encode("RIFF\x24\x00\x00\x00WAVEfmt ")), null);
    assert.equal(detectQrImage(new Uint8Array([0xff, 0xd8])), null);
    assert.equal(detectQrImage(new Uint8Array()), null);
  });
});

describe("validatePaymentQr", () => {
  it("returns the content type from the bytes, ignoring the name", () => {
    assert.deepEqual(validatePaymentQr({ size: 1000 }, PNG), { ok: true, contentType: "image/png" });
  });
  it("accepts exactly 5 MB and rejects one byte more", () => {
    assert.equal(validatePaymentQr({ size: MAX_PAYMENT_QR_BYTES }, JPEG).ok, true);
    assert.deepEqual(validatePaymentQr({ size: MAX_PAYMENT_QR_BYTES + 1 }, JPEG), { ok: false, error: PAYMENT_QR_TOO_BIG });
  });
  it("rejects empty files and non-images", () => {
    assert.deepEqual(validatePaymentQr({ size: 0 }, new Uint8Array()), { ok: false, error: "Selecciona la imagen del QR." });
    assert.deepEqual(validatePaymentQr({ size: 10 }, PDF), {
      ok: false,
      error: "El archivo no es una imagen válida. Usa JPG, PNG o WEBP.",
    });
  });
});

describe("resolveQrTarget", () => {
  it("derives bucket and path from a public URL of this project", () => {
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/public/key_nacergroup/llave.jpeg`, SB), {
      bucket: "key_nacergroup",
      path: "llave.jpeg",
    });
  });
  it("supports folders, query strings and encoded characters", () => {
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/public/b/a%20b/c.png?v=1#x`, SB), {
      bucket: "b",
      path: "a b/c.png",
    });
  });
  it("falls back for null, foreign hosts, other URL shapes and traversal", () => {
    const fallback = { bucket: "key_nacergroup", path: "llave.jpeg" };
    assert.deepEqual(resolveQrTarget(null, SB), fallback);
    assert.deepEqual(resolveQrTarget("", SB), fallback);
    assert.deepEqual(resolveQrTarget("https://evil.com/storage/v1/object/public/key_nacergroup/x.png", SB), fallback);
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/sign/key_nacergroup/x.png`, SB), fallback);
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/public/key_nacergroup/`, SB), fallback);
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/public/key_nacergroup/../x.png`, SB), fallback);
    assert.deepEqual(resolveQrTarget("not a url", SB), fallback);
    assert.deepEqual(resolveQrTarget(`${SB}/storage/v1/object/public/%E0%A4%A`, SB), fallback);
  });
});

describe("paymentQrViewUrl", () => {
  it("appends a cache-busting version", () => {
    assert.equal(paymentQrViewUrl("https://x/y.jpeg", "2026-11-20T03:30:00.000Z"), "https://x/y.jpeg?v=2026-11-20T03%3A30%3A00.000Z");
  });
  it("leaves the url untouched without a date", () => {
    assert.equal(paymentQrViewUrl("https://x/y.jpeg", null), "https://x/y.jpeg");
  });
});
