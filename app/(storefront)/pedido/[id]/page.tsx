import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { OrderMessage } from "@/components/order/OrderMessage";
import { PaymentPanel } from "@/components/order/PaymentPanel";
import { allowOrderPageRequest } from "@/lib/data/order-page-rate-limit";
import { loadOrderView } from "@/lib/data/order-page";
import { isOrderId, type OrderView } from "@/lib/domain/checkout/orderView";
import { formatCop } from "@/lib/format";

/**
 * Public order page (slice 6). The order UUID in the URL is the bearer token:
 * anyone holding the link sees the same page, so it shows NO personal data
 * (no buyer, recipient, address or invoice data; `sale_details` is never read).
 *
 * It only READS the payment state the database holds. It does not look at
 * Mercado Pago's return parameters (`collection_status`, `payment_id`...) and
 * never marks anything as paid (README ADR-0010): only the store webhook, via
 * `confirm_order`, does.
 *
 * Missing, malformed and non-web ids all answer the same 404. `connection()`
 * keeps the route dynamic (never prerendered, never shared between customers);
 * the `robots` and `referrer` metadata render `noindex, nofollow` and
 * `<meta name="referrer" content="no-referrer">`. A response HEADER through
 * `next.config.ts` `headers()` is NOT applied today: the stray `module.exports`
 * at the bottom of that file replaces the whole config object.
 */
export const metadata: Metadata = {
  title: "Tu pedido — Crisálidas y Mariposas",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OrderPage({ params }: PageProps<"/pedido/[id]">) {
  await connection();

  if (!(await allowOrderPageRequest())) {
    return (
      <OrderMessage
        title="Demasiadas consultas"
        body="Hicimos varias consultas seguidas. Espera un minuto y vuelve a abrir esta página."
      />
    );
  }

  const { id } = await params;
  if (!isOrderId(id)) notFound();

  let parsed;
  try {
    parsed = await loadOrderView(id, new Date());
  } catch (error) {
    console.error("order page: loadOrderView failed", error);
    return <OrderUnavailable />;
  }
  if (parsed.kind === "not_found") notFound();
  if (parsed.kind !== "ok") {
    console.error(`order page: order ${id} is ${parsed.kind}`);
    return <OrderUnavailable />;
  }

  const view = parsed.view;
  return (
    <main className="flex flex-1 flex-col px-4 pt-20 pb-16 sm:px-6 md:px-16 md:pt-28">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <p className="font-body text-xs uppercase tracking-[0.16em] text-moss">Tu pedido</p>
          <h1 className="mt-1 font-display text-2xl text-ink md:text-3xl">Pedido {view.humanNumber}</h1>
          <p className="mt-1 font-body text-sm text-ink-muted">Creado el {view.createdAtLabel}</p>
        </header>

        <PaymentPanel view={view} />

        {view.lines.length > 0 && <OrderLines view={view} />}
        <DeliverySummary view={view} />
      </div>
    </main>
  );
}

function OrderUnavailable() {
  return (
    <OrderMessage
      title="No pudimos mostrar tu pedido"
      body="Hubo un problema al cargar la información. Inténtalo de nuevo en unos minutos."
    />
  );
}

function OrderLines({ view }: { view: OrderView }) {
  return (
    <section aria-labelledby="order-lines">
      <h2 id="order-lines" className="font-display text-xl text-ink">
        Lo que llevas
      </h2>
      <ul className="mt-2 divide-y divide-ink/10">
        {view.lines.map((line, index) => (
          <li key={`${line.productName}-${index}`} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-body text-sm text-ink">{line.productName}</p>
              <p className="font-body text-xs text-ink-muted">
                {line.variantLabel ? `${line.variantLabel} · ` : ""}
                {line.qty} × {formatCop(line.unitPrice)}
              </p>
              {line.options.map((o) => (
                <p key={o.name} className="font-body text-xs text-ink-muted">
                  + {o.name} × {o.qty} ({formatCop(o.unitPrice)} c/u)
                </p>
              ))}
            </div>
            <span className="font-body text-sm tabular-nums text-ink">{formatCop(line.totalPrice)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeliverySummary({ view }: { view: OrderView }) {
  const { delivery } = view;
  const method = delivery.method === "domicilio" ? "Domicilio" : delivery.method === "tienda" ? "Recoger en el taller" : null;
  const showTotals = view.lines.length > 0;

  return (
    <section aria-labelledby="order-totals" className="rounded-2xl border border-ink/10 bg-cream-soft p-4 sm:p-5">
      <h2 id="order-totals" className="font-display text-xl text-ink">
        {delivery.method === "tienda" ? "Recogida y total" : "Entrega y total"}
      </h2>
      <dl className="mt-2 space-y-2 font-body text-sm">
        {method && (
          <div>
            <dt className="text-ink-muted">Método</dt>
            <dd className="text-ink">{method}</dd>
          </div>
        )}
        {delivery.dateLabel && (
          <div>
            <dt className="text-ink-muted">Fecha</dt>
            <dd className="text-ink">{delivery.dateLabel}</dd>
          </div>
        )}
        {showTotals && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd className="tabular-nums text-ink">{formatCop(view.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-muted">Domicilio</dt>
              <dd className="tabular-nums text-ink">{formatCop(view.deliveryFee)}</dd>
            </div>
          </>
        )}
        <div className="flex justify-between gap-4 border-t border-ink/10 pt-2">
          <dt className="font-medium text-ink">{view.paymentState === "paid" ? "Total pagado" : "Total"}</dt>
          <dd className="font-medium tabular-nums text-ink">
            {formatCop(view.payment?.paidAmount ?? view.grandTotal)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
