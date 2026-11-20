import type { Metadata } from "next";
import {
  getBusinessSettings,
  getUpcomingHolidays,
  getWeekSchedule,
} from "@/lib/data/business-settings";
import { getCatalogInfo } from "@/lib/admin/catalogPdfStorage";
import { bogotaDate } from "@/lib/domain/checkout/deliveryCalendar";
import { CatalogPdfForm } from "./CatalogPdfForm";
import { BusinessHoursForm } from "./BusinessHoursForm";
import { BusinessSettingsForm } from "./BusinessSettingsForm";
import { HolidaysManager } from "./HolidaysManager";

export const metadata: Metadata = { title: "Configuración — Panel Nacer Group" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const today = bogotaDate(new Date());
  const [settings, week, holidays, catalog] = await Promise.all([
    getBusinessSettings(),
    getWeekSchedule(),
    getUpcomingHolidays(today),
    getCatalogInfo(),
  ]);

  return (
    <div className="animate-view-in flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-admin-ink">Configuración</h1>
        <p className="text-sm text-admin-ink-muted">
          Datos del negocio que cita el asistente de WhatsApp, horario de atención, festivos y catálogo en PDF.
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

      <section aria-labelledby="sec-horario" className="flex flex-col gap-3">
        <h2 id="sec-horario" className="text-base font-semibold text-admin-ink">
          Horario de atención
        </h2>
        <BusinessHoursForm initial={week} />
      </section>

      <section aria-labelledby="sec-festivos" className="flex flex-col gap-3">
        <h2 id="sec-festivos" className="text-base font-semibold text-admin-ink">
          Festivos
        </h2>
        <p className="text-sm text-admin-ink-muted">Cada festivo cierra el día completo. Se listan desde hoy.</p>
        <HolidaysManager holidays={holidays} today={today} />
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
