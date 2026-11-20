import type { Metadata } from "next";
import { getUpcomingHolidays, getWeekSchedule } from "@/lib/data/business-settings";
import { bogotaDate } from "@/lib/domain/checkout/deliveryCalendar";
import { BusinessHoursForm } from "../BusinessHoursForm";
import { ConfigTabs } from "../ConfigTabs";
import { HolidaysManager } from "../HolidaysManager";

export const metadata: Metadata = { title: "Horario de atención — Panel Nacer Group" };
export const dynamic = "force-dynamic";

export default async function ConfiguracionHorarioPage() {
  const today = bogotaDate(new Date());
  const [week, holidays] = await Promise.all([getWeekSchedule(), getUpcomingHolidays(today)]);

  return (
    <div className="animate-view-in flex flex-col gap-6">
      <ConfigTabs active="horario" />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-admin-ink">Horario de atención</h1>
        <p className="text-sm text-admin-ink-muted">
          Horario semanal y festivos que el asistente de WhatsApp usa para responder cuándo se atiende.
        </p>
      </div>

      <section aria-labelledby="sec-horario" className="flex flex-col gap-3">
        <h2 id="sec-horario" className="text-base font-semibold text-admin-ink">
          Horario semanal
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
    </div>
  );
}
