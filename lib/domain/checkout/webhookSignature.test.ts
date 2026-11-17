import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSignatureManifest, parseSignatureHeader, verifyWebhookSignature } from "./webhookSignature.ts";

// Vectors computed outside this code with:
//   printf '%s' "<manifest>" | openssl dgst -sha256 -hmac "nacer-test-secret" -hex
const SECRET = "nacer-test-secret";
const TS = "1742505638683";
const REQUEST_ID = "bb56a2f1-6aae-46ac-982e-9dcd3581d08e";
const V1_FULL = "0fd248f386049b909e30b8dabaf4169c648f6c6cad78582b9d3221b52d297fc6"; // id:123456;request-id:…;ts:…;
const V1_ALNUM = "fbfad7b42dd18a3e49aa9dfe52d260dcdcd966e45d08c13e16426cedc913363d"; // id:abc123def;request-id:…;ts:…;
const V1_NO_ID = "82090aa4e77190e5b931bf971693aefbd5caffb7d4d00269ec658f90b44e3449"; // request-id:…;ts:…;
const V1_NO_REQUEST_ID = "6d814bee9299c7ff397bdbcbbc4aaaa9f573c3d089f5211ad090837c621ce489"; // id:123456;ts:…;

describe("parseSignatureHeader", () => {
  it("reads ts and v1 from the x-signature header", () => {
    assert.deepEqual(parseSignatureHeader(`ts=${TS},v1=${V1_FULL}`), { ts: TS, v1: V1_FULL });
  });

  it("tolerates spaces and any order of the parts", () => {
    assert.deepEqual(parseSignatureHeader(` v1 = ${V1_FULL} , ts = ${TS} `), { ts: TS, v1: V1_FULL });
  });

  it("ignores unknown parts", () => {
    assert.deepEqual(parseSignatureHeader(`ts=${TS},v2=zzz,v1=${V1_FULL}`), { ts: TS, v1: V1_FULL });
  });

  it("returns null when the header is absent, empty or incomplete", () => {
    for (const header of [null, undefined, "", "garbage", `ts=${TS}`, `v1=${V1_FULL}`, `ts=,v1=${V1_FULL}`, `ts=${TS},v1=`]) {
      assert.equal(parseSignatureHeader(header), null, String(header));
    }
  });
});

describe("buildSignatureManifest", () => {
  it("builds id;request-id;ts with a trailing semicolon", () => {
    assert.equal(
      buildSignatureManifest({ dataId: "123456", requestId: REQUEST_ID, ts: TS }),
      `id:123456;request-id:${REQUEST_ID};ts:${TS};`,
    );
  });

  it("lowercases an alphanumeric data.id", () => {
    assert.equal(
      buildSignatureManifest({ dataId: "ABC123def", requestId: REQUEST_ID, ts: TS }),
      `id:abc123def;request-id:${REQUEST_ID};ts:${TS};`,
    );
  });

  it("omits the parts whose value is absent", () => {
    assert.equal(buildSignatureManifest({ dataId: null, requestId: REQUEST_ID, ts: TS }), `request-id:${REQUEST_ID};ts:${TS};`);
    assert.equal(buildSignatureManifest({ dataId: "123456", requestId: "", ts: TS }), `id:123456;ts:${TS};`);
    assert.equal(buildSignatureManifest({ dataId: "", requestId: null, ts: TS }), `ts:${TS};`);
  });
});

describe("verifyWebhookSignature", () => {
  const valid = { header: `ts=${TS},v1=${V1_FULL}`, dataId: "123456", requestId: REQUEST_ID, secret: SECRET };

  it("accepts a signature computed with the secret over the manifest", () => {
    assert.equal(verifyWebhookSignature(valid), true);
  });

  it("accepts an uppercase hex v1", () => {
    assert.equal(verifyWebhookSignature({ ...valid, header: `ts=${TS},v1=${V1_FULL.toUpperCase()}` }), true);
  });

  it("lowercases the data.id before signing, as Mercado Pago does", () => {
    assert.equal(
      verifyWebhookSignature({ ...valid, dataId: "ABC123DEF", header: `ts=${TS},v1=${V1_ALNUM}` }),
      true,
    );
  });

  it("verifies notifications without data.id or without x-request-id", () => {
    assert.equal(verifyWebhookSignature({ ...valid, dataId: null, header: `ts=${TS},v1=${V1_NO_ID}` }), true);
    assert.equal(
      verifyWebhookSignature({ ...valid, requestId: null, header: `ts=${TS},v1=${V1_NO_REQUEST_ID}` }),
      true,
    );
  });

  it("rejects a wrong secret", () => {
    assert.equal(verifyWebhookSignature({ ...valid, secret: "other-secret" }), false);
  });

  it("rejects when any signed value was tampered with", () => {
    assert.equal(verifyWebhookSignature({ ...valid, dataId: "123457" }), false);
    assert.equal(verifyWebhookSignature({ ...valid, requestId: "other-request" }), false);
    assert.equal(verifyWebhookSignature({ ...valid, header: `ts=1742505638684,v1=${V1_FULL}` }), false);
  });

  it("rejects a v1 that is not 64 hex characters without throwing", () => {
    for (const v1 of [V1_FULL.slice(0, 63), `${V1_FULL}00`, `${V1_FULL.slice(0, 63)}g`, "abc"]) {
      assert.equal(verifyWebhookSignature({ ...valid, header: `ts=${TS},v1=${v1}` }), false, v1);
    }
  });

  it("rejects a missing or malformed header", () => {
    assert.equal(verifyWebhookSignature({ ...valid, header: null }), false);
    assert.equal(verifyWebhookSignature({ ...valid, header: "nonsense" }), false);
  });

  it("rejects everything when the secret is empty", () => {
    assert.equal(verifyWebhookSignature({ ...valid, secret: "" }), false);
  });
});
