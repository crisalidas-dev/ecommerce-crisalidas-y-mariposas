import type { Metadata } from "next";
import { getBusinessSettings } from "@/lib/data/business-settings";
import { getCatalogInfo } from "@/lib/admin/catalogPdfStorage";
import { getPaymentQrInfo } from "@/lib/admin/paymentQrStorage";
import { getPaymentInfo } from "@/lib/data/payment-info";
import { PaymentInfoForm } from "./PaymentInfoForm";
import { PaymentQrForm } from "./PaymentQrForm";
import { CatalogPdfForm } from "./CatalogPdfForm";
import { BusinessSettingsForm } from "./BusinessSettingsForm";
import { ConfigTabs } from "./ConfigTabs";

export const metadata: Metadata = { title: "Negocio — Panel Nacer Group" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionNegocioPage() {
  const [settings, catalog, paymentInfo] = await Promise.all([
    getBusinessSettings(),
    getCatalogInfo(),
    getPaymentInfo(),
  ]);
  const paymentQr = paymentInfo ? await getPaymentQrInfo(paymentInfo.qr_url) : null;

  return (
    <div className="animate-view-in flex flex-col gap-6">
      <ConfigTabs active="negocio" />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-admin-ink">Negocio</h1>
        <p className="text-sm text-admin-ink-muted">
          Datos del negocio que cita el asistente de WhatsApp, datos de pago y catálogo en PDF que envía a los clientes.
        </p>
      </div>

      <section aria-labelledby="sec-negocio" className="flex flex-col gap-3">
        <h2 id="sec-negocio" className="text-base font-semibold text-admin-ink">
          Datos del negocio
        </h2>
        {settings ? (
          <BusinessSettingsForm settings={settings} />
        ) : (
          <p role="alert" className="text-sm text-admin-critical-fg">
            No se encontró la fila de datos del negocio. Falta aplicar la migración 046 en la base de datos.
          </p>
        )}
      </section>

      <section aria-labelledby="sec-pago" className="flex flex-col gap-3">
        <h2 id="sec-pago" className="text-base font-semibold text-admin-ink">
          Datos de pago
        </h2>
        <p className="text-sm text-admin-ink-muted">
          Datos que el asistente de WhatsApp comparte con los clientes para pagar por transferencia: cuenta bancaria,
          llave y código QR.
        </p>
        {paymentInfo && paymentQr ? (
          <>
            <PaymentInfoForm info={paymentInfo} />
            <PaymentQrForm publicUrl={paymentQr.publicUrl} file={paymentQr.file} />
          </>
        ) : (
          <p role="alert" className="text-sm text-admin-critical-fg">
            No se encontró la fila de datos de pago (payment_info, id = 1). Avisa al equipo técnico.
          </p>
        )}
      </section>

      <section aria-labelledby="sec-catalogo" className="flex flex-col gap-3">
        <h2 id="sec-catalogo" className="text-base font-semibold text-admin-ink">
          Catálogo en PDF
        </h2>
        <p className="text-sm text-admin-ink-muted">
          Archivo que el asistente de WhatsApp envía a los clientes. Al subir uno nuevo se reemplaza el actual.
        </p>
        <CatalogPdfForm publicUrl={catalog.publicUrl} file={catalog.file} />
      </section>
    </div>
  );
}
