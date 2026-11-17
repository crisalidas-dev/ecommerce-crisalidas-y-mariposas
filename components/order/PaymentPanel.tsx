import Link from "next/link";
import { PRIMARY, SECONDARY } from "@/components/checkout/formStyles";
import { orderPagePath } from "@/lib/domain/checkout/mercadoPagoPreference";
import type { OrderView, PaymentState } from "@/lib/domain/checkout/orderView";
import { RECEIPT_LEGAL_NOTE } from "@/lib/domain/checkout/receipt";
import { ClearCheckoutOnPaid } from "./ClearCheckoutOnPaid";
import { OrderAutoRefresh } from "./OrderAutoRefresh";

/**
 * Payment state panel of the order page (Server Component). Pure presentation
 * of `view.paymentState`, which the server derived from the database. The
 * client leaves are tiny: the refresher (unfinished payments) and the cart
 * cleaner (paid only).
 */

const TONE: Record<PaymentState, string> = {
  paid: "border-moss/40 bg-moss/8",
  pending: "border-ink/15 bg-cream-soft",
  processing: "border-ink/15 bg-cream-soft",
  rejected: "border-danger/40 bg-danger/5",
  expired: "border-ink/15 bg-cream-soft",
  refunded: "border-ink/15 bg-cream-soft",
};

const COPY: Record<PaymentState, { title: string; body: string }> = {
  paid: {
    title: "Pago confirmado",
    body: "Recibimos tu pago y tu pedido quedó confirmado. Guarda tu comprobante.",
  },
  pending: {
    title: "Esperando la confirmación de tu pago",
    body: "Todavía no vemos tu pago. Si ya pagaste, Mercado Pago nos avisa en segundos con tarjeta; con PSE puede tardar unos minutos. Esta página se actualiza sola y también puedes usar el botón.",
  },
  processing: {
    title: "Tu pago está en proceso",
    body: "Mercado Pago aún no confirma el pago. Con PSE puede tardar unos minutos. No necesitas pagar de nuevo: esta página se actualiza sola y también puedes usar el botón.",
  },
  rejected: {
    title: "No se aprobó el pago",
    body: "Mercado Pago no aprobó el pago. Puedes intentarlo de nuevo con otro medio mientras tus productos siguen separados.",
  },
  expired: {
    title: "Este pedido venció",
    body: "El tiempo de la reserva terminó y no se registró ningún pago en este pedido. Puedes volver al catálogo y armar uno nuevo.",
  },
  refunded: {
    title: "Pago reembolsado",
    body: "El pago de este pedido fue reembolsado.",
  },
};

export function PaymentPanel({ view }: { view: OrderView }) {
  const { paymentState } = view;
  const copy = COPY[paymentState];
  const unfinished = paymentState === "pending" || paymentState === "processing";

  return (
    <section
      aria-labelledby="payment-state"
      role="status"
      aria-live="polite"
      className={`rounded-2xl border p-4 font-body text-sm text-ink sm:p-5 ${TONE[paymentState]}`}
    >
      <h2 id="payment-state" className="font-display text-xl text-ink">
        {copy.title}
      </h2>
      <p className="mt-1">{copy.body}</p>

      {paymentState === "paid" && (
        <>
          <ClearCheckoutOnPaid orderId={view.orderId} />
          <div className="mt-4">
            {/* Plain anchor: the route answers an attachment, not a page to navigate to. */}
            <a href={`${orderPagePath(view.orderId)}/comprobante`} download className={PRIMARY}>
              Descargar comprobante (PDF)
            </a>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{RECEIPT_LEGAL_NOTE}</p>
        </>
      )}

      {unfinished && (
        <div className="mt-4 flex flex-wrap gap-3">
          <OrderAutoRefresh />
          <Link href="/checkout" className={SECONDARY}>
            Volver al pago
          </Link>
        </div>
      )}

      {paymentState === "rejected" && (
        <div className="mt-4">
          <Link href="/checkout" className={PRIMARY}>
            Intentar de nuevo
          </Link>
        </div>
      )}

      {(paymentState === "expired" || paymentState === "refunded") && (
        <div className="mt-4">
          <Link href="/catalogo" className={PRIMARY}>
            Ver el catálogo
          </Link>
        </div>
      )}
    </section>
  );
}
