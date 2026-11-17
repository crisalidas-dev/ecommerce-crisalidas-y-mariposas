import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Mercado Pago webhook signature (`x-signature`), slice 7. Pure and
 * deterministic: no env, no clock.
 *
 * Verified against Mercado Pago's "Configure payment notifications" guide
 * (Checkout Pro, "Validate the origin of a notification", without SDK):
 *  1. `x-signature` is `ts=<ts>,v1=<hex>`; split on `,`, then on the first `=`.
 *  2. Manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. `data.id`
 *     comes from the QUERY STRING and is lowercased. A pair whose value is
 *     absent is omitted.
 *  3. HMAC-SHA256 of the manifest with the application's webhook secret, hex.
 *  4. Constant-time comparison with `v1`.
 *
 * No timestamp window is enforced: Mercado Pago retries for days, and a
 * replayed notification is harmless because the handler only acts on what
 * `GET /v1/payments/{id}` answers and every database write is idempotent.
 */

export interface SignatureParts {
  ts: string;
  v1: string;
}

export function parseSignatureHeader(header: string | null | undefined): SignatureParts | null {
  if (!header) return null;
  let ts = "";
  let v1 = "";
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

export interface ManifestInput {
  /** `data.id` as received in the query string, or null when absent. */
  dataId: string | null | undefined;
  /** `x-request-id` header, or null when absent. */
  requestId: string | null | undefined;
  ts: string;
}

export function buildSignatureManifest({ dataId, requestId, ts }: ManifestInput): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId.toLowerCase()}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return `${parts.join(";")};`;
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

export interface VerifyInput {
  header: string | null | undefined;
  dataId: string | null | undefined;
  requestId: string | null | undefined;
  secret: string;
}

export function verifyWebhookSignature({ header, dataId, requestId, secret }: VerifyInput): boolean {
  if (!secret) return false;
  const parts = parseSignatureHeader(header);
  if (parts === null || !HEX_SHA256.test(parts.v1)) return false;

  const expected = createHmac("sha256", secret)
    .update(buildSignatureManifest({ dataId, requestId, ts: parts.ts }))
    .digest();
  const received = Buffer.from(parts.v1, "hex");
  // Equal-length guard: timingSafeEqual throws on different lengths.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
