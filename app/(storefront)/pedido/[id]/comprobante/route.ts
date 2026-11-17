import { allowReceiptRequest } from "@/lib/data/order-page-rate-limit";
import { loadOrderView, loadReceiptBusiness } from "@/lib/data/order-page";
import { isOrderId } from "@/lib/domain/checkout/orderView";
import { buildReceipt } from "@/lib/domain/checkout/receipt";
import { renderReceiptPdf } from "@/lib/pdf/ReceiptDocument";

/**
 * GET /pedido/[id]/comprobante: PDF payment receipt (slice 6).
 *
 * Same access model as the order page: the order UUID is the bearer token.
 * A malformed id, a missing order, a non-web order and an order that is not
 * paid all answer the same bare 404, so the route is no oracle. It only READS
 * state; it never marks anything as paid (README ADR-0010). Never cached.
 * GET handlers are dynamic by default in Next 16.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

export async function GET(_request: Request, ctx: RouteContext<"/pedido/[id]/comprobante">) {
  if (!(await allowReceiptRequest())) {
    return new Response("Too many requests", { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
  }

  const { id } = await ctx.params;
  if (!isOrderId(id)) return notFound();

  let parsed;
  try {
    parsed = await loadOrderView(id, new Date());
  } catch (error) {
    console.error("receipt: loadOrderView failed", error);
    return new Response("Service unavailable", { status: 503, headers: NO_STORE });
  }
  if (parsed.kind === "not_found") return notFound();
  if (parsed.kind !== "ok") {
    console.error(`receipt: order ${id} is ${parsed.kind}`);
    return new Response("Service unavailable", { status: 503, headers: NO_STORE });
  }

  const receipt = buildReceipt(parsed.view, await loadReceiptBusiness());
  if (receipt === null) return notFound();

  let pdf: Buffer;
  try {
    pdf = await renderReceiptPdf(receipt);
  } catch (error) {
    console.error("receipt: render failed", error);
    return new Response("Service unavailable", { status: 503, headers: NO_STORE });
  }

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receipt.filename}"`,
      "Content-Length": String(pdf.byteLength),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      ...NO_STORE,
    },
  });
}
