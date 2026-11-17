import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatCop } from "@/lib/format";
import type { ReceiptData } from "@/lib/domain/checkout/receipt";

/**
 * PDF payment receipt (slice 6). Layout only: every value comes from
 * `buildReceipt` (pure, tested). Server-side rendering with
 * `@react-pdf/renderer`; the standard Helvetica font covers Spanish accents.
 *
 * A PDF cannot read the CSS variables of the storefront, so these values
 * mirror the `--color-*` tokens of `app/globals.css`. TODO(cliente): when the
 * brand identity arrives, update both places (they are the only copies).
 */
const PDF_TOKENS = {
  ink: "#161810", // --color-ink
  inkMuted: "#595951", // --color-ink-muted
  moss: "#4b6b4e", // --color-moss
  line: "#d9d3c4", // hairlines, derived from --color-cream-soft
  panel: "#f6f1e7", // --color-cream
} as const;

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", fontSize: 10, color: PDF_TOKENS.ink },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold", color: PDF_TOKENS.moss },
  business: { marginTop: 2, fontSize: 9, color: PDF_TOKENS.inkMuted },
  title: { marginTop: 24, fontSize: 20, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 12, padding: 12, backgroundColor: PDF_TOKENS.panel },
  metaRow: { flexDirection: "row", marginBottom: 3 },
  metaLabel: { width: 130, color: PDF_TOKENS.inkMuted },
  metaValue: { flex: 1 },
  tableHead: {
    flexDirection: "row",
    marginTop: 24,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: PDF_TOKENS.ink,
    fontFamily: "Helvetica-Bold",
  },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: PDF_TOKENS.line },
  colDescription: { flex: 1, paddingRight: 8 },
  colQty: { width: 40, textAlign: "right" },
  colUnit: { width: 80, textAlign: "right" },
  colTotal: { width: 90, textAlign: "right" },
  detail: { marginTop: 1, fontSize: 9, color: PDF_TOKENS.inkMuted },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: PDF_TOKENS.ink,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  legal: { position: "absolute", left: 48, right: 48, bottom: 40, fontSize: 8.5, color: PDF_TOKENS.inkMuted },
});

function ReceiptDocument({ data }: { data: ReceiptData }) {
  return (
    <Document title={`${data.title} ${data.humanNumber}`} author="Nacer Group" language="es">
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>{data.brand}</Text>
        {data.businessLines.map((line) => (
          <Text key={line} style={styles.business}>
            {line}
          </Text>
        ))}

        <Text style={styles.title}>{data.title}</Text>

        <View style={styles.meta}>
          <MetaRow label="Pedido" value={data.humanNumber} />
          <MetaRow label="Fecha de pago" value={data.paymentDateLabel ?? "—"} />
          <MetaRow label="Medio de pago" value={data.paymentSource} />
          <MetaRow label="Referencia de pago" value={data.paymentReference ?? "—"} />
          {data.delivery !== null && <MetaRow label="Entrega" value={data.delivery} />}
        </View>

        <View style={styles.tableHead}>
          <Text style={styles.colDescription}>Producto</Text>
          <Text style={styles.colQty}>Cant.</Text>
          <Text style={styles.colUnit}>Valor unitario</Text>
          <Text style={styles.colTotal}>Total</Text>
        </View>
        {data.lines.map((line, index) => (
          <View key={`${line.description}-${index}`} style={styles.row} wrap={false}>
            <View style={styles.colDescription}>
              <Text>{line.description}</Text>
              {line.details.map((detail) => (
                <Text key={detail} style={styles.detail}>
                  {detail}
                </Text>
              ))}
            </View>
            <Text style={styles.colQty}>{line.qty}</Text>
            <Text style={styles.colUnit}>{formatCop(line.unitPrice)}</Text>
            <Text style={styles.colTotal}>{formatCop(line.totalPrice)}</Text>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{formatCop(data.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>Domicilio</Text>
            <Text>{formatCop(data.deliveryFee)}</Text>
          </View>
          <View style={styles.grand}>
            <Text>Total pagado</Text>
            <Text>{formatCop(data.totalPaid)}</Text>
          </View>
        </View>

        <Text style={styles.legal} fixed>
          {data.legalNote}
        </Text>
      </Page>
    </Document>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

/** Renders the receipt to a PDF. */
export function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument data={data} />);
}
