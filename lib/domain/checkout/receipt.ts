import type { OrderView } from "./orderView.ts";

/**
 * Data of the PDF payment receipt (slice 6). Pure: maps the order view to
 * exactly what the document prints; the PDF component only lays it out.
 *
 * It is a payment receipt, NOT an electronic invoice. No personal data: the
 * view it is built from has none. Only a PAID order has a receipt.
 */

export const RECEIPT_LEGAL_NOTE =
  "Este documento es un comprobante de pago y no constituye factura electrónica de venta.";

const RECEIPT_BRAND = "Nacer Group — Crisálidas y Mariposas";

/** Public business details the admin configuration already exposes (`business_settings`). */
export interface ReceiptBusiness {
  address: string | null;
  website: string | null;
}

export interface ReceiptLine {
  description: string;
  /** Add-ons, one per entry. */
  details: string[];
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ReceiptData {
  filename: string;
  brand: string;
  /** Address and website lines under the brand; empty when not configured. */
  businessLines: string[];
  title: string;
  humanNumber: string;
  paymentDateLabel: string | null;
  paymentReference: string | null;
  paymentSource: string;
  /** Method and date only; never an address. */
  delivery: string | null;
  lines: ReceiptLine[];
  subtotal: number;
  deliveryFee: number;
  /** What was charged (`paid_amount`). Integer COP. */
  totalPaid: number;
  legalNote: string;
}

/** `comprobante-C0002.pdf`; only characters that are safe in a header and a file name. */
export function receiptFilename(humanNumber: string): string {
  const safe = humanNumber.replace(/[^A-Za-z0-9_-]/g, "");
  return `comprobante-${safe || "pedido"}.pdf`;
}

function describeDelivery(delivery: OrderView["delivery"]): string | null {
  if (delivery.method === null) return null;
  const method = delivery.method === "domicilio" ? "Domicilio" : "Recogida en el taller";
  return delivery.dateLabel ? `${method} · ${delivery.dateLabel}` : method;
}

/** The receipt of a paid order, or null when there is nothing to certify. */
export function buildReceipt(view: OrderView, business: ReceiptBusiness | null): ReceiptData | null {
  if (view.paymentState !== "paid" || view.payment === null) return null;

  return {
    filename: receiptFilename(view.humanNumber),
    brand: RECEIPT_BRAND,
    businessLines: [business?.address, business?.website].filter(
      (line): line is string => typeof line === "string" && line.trim() !== "",
    ),
    title: "Comprobante de pago",
    humanNumber: view.humanNumber,
    paymentDateLabel: view.payment.confirmedAtLabel,
    paymentReference: view.payment.reference,
    paymentSource: "Mercado Pago",
    delivery: describeDelivery(view.delivery),
    lines: view.lines.map((line) => ({
      description: line.variantLabel ? `${line.productName} (${line.variantLabel})` : line.productName,
      details: line.options.map((o) => `+ ${o.name} × ${o.qty}`),
      qty: line.qty,
      unitPrice: line.unitPrice,
      totalPrice: line.totalPrice,
    })),
    subtotal: view.subtotal,
    deliveryFee: view.deliveryFee,
    totalPaid: view.payment.paidAmount,
    legalNote: RECEIPT_LEGAL_NOTE,
  };
}
