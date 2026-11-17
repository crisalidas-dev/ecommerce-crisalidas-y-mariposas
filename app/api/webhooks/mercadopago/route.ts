import { getMercadoPagoPayment } from "@/lib/data/mercadopago";
import { callConfirmOrder, callRecordPaymentIncident, callSetPaymentStatus } from "@/lib/data/payment-webhook";
import { handlePaymentWebhook } from "@/lib/domain/checkout/handlePaymentWebhook";

/**
 * POST /api/webhooks/mercadopago: the store's own Mercado Pago webhook
 * (slice 7, README ADR-0010). It is the `notification_url` of every web
 * preference.
 *
 * Thin on purpose: read the request, hand it to `handlePaymentWebhook`, map
 * the result to a status code. No rate limiting by IP: Mercado Pago posts from
 * shared addresses and the signature is the gate. POST handlers are never
 * cached; the answer also says `no-store`. Node runtime (node:crypto).
 * Processed inline, no queue (ADR-0010).
 */
export const runtime = "nodejs";

/** A real notification is a few hundred bytes. */
const MAX_BODY_BYTES = 16 * 1024;
const HEADERS = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } as const;

function reply(status: number, text: string): Response {
  return new Response(text, { status, headers: HEADERS });
}

/** Raw body up to `limit` bytes; null when it is larger. Unreadable streams count as empty. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return "";
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return reply(413, "Payload too large");

  const result = await handlePaymentWebhook(
    {
      query: new URL(request.url).searchParams,
      body: parseJson(raw),
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
    },
    {
      secret: process.env.MP_WEBHOOK_SECRET,
      getPayment: getMercadoPagoPayment,
      confirmOrder: callConfirmOrder,
      setPaymentStatus: callSetPaymentStatus,
      recordPaymentIncident: callRecordPaymentIncident,
      logError: (line) => console.error(line),
    },
  );

  if (result.status === 401) return reply(401, "Invalid signature");
  if (result.status === 500) return reply(500, "Not processed; retry");
  return reply(200, "OK");
}
