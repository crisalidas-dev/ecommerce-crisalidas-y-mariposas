import type { Metadata } from "next";
import { getBusinessSettings } from "@/lib/data/business-settings";
import { getCatalogInfo } from "@/lib/admin/catalogPdfStorage";
import { CatalogPdfForm } from "./CatalogPdfForm";
import { BusinessSettingsForm } from "./BusinessSettingsForm";
import { ConfigTabs } from "./ConfigTabs";

export const metadata: Metadata = { title: "Negocio — Panel Nacer Group" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionNegocioPage() {
  const [settings, catalog] = await Promise.all([getBusinessSettings(), getCatalogInfo()]);

  return (
    <div className="animate-view-in flex flex-col gap-6">
      <ConfigTabs active="negocio" />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-admin-ink">Negocio</h1>
        <p className="text-sm text-admin-ink-muted">
          Datos del negocio que cita el asistente de WhatsApp y catálogo en PDF que envía a los clientes.
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
