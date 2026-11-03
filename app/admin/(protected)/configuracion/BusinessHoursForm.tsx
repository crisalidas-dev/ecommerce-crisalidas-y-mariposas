"use client";

import { useState, useTransition } from "react";
import { WEEKDAY_LABEL, type DaySchedule } from "@/lib/domain/businessHours";
import { ActionStatus, type StatusMessage } from "../ui/ActionStatus";
import { errorTextClass, fieldsetClass, inputClass, primaryButtonClass } from "../ui/formClasses";
import { saveBusinessHours } from "./actions";

export function BusinessHoursForm({ initial }: { initial: DaySchedule[] }) {
  const [days, setDays] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(weekday: number, change: Partial<DaySchedule>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...change } : d)));
    setStatus(null);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await saveBusinessHours(days);
      if (res.ok) {
        setErrors({});
        setStatus({ tone: "ok", text: "Horario guardado" });
      } else {
        setErrors(res.fieldErrors);
        setStatus({ tone: "error", text: res.error });
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={pending} className={fieldsetClass}>
      <ul className="flex flex-col divide-y divide-admin-border">
        {days.map((d) => {
          const error = errors[`day:${d.weekday}`];
          const label = WEEKDAY_LABEL[d.weekday];
          return (
            <li key={d.weekday} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
              <label className="flex min-h-11 w-40 items-center gap-2 text-sm font-medium text-admin-ink">
                <input
                  type="checkbox"
                  checked={d.open}
                  onChange={(e) => patch(d.weekday, { open: e.target.checked })}
                  aria-label={`${label}: abierto`}
                />
                {label}
                <span className="text-xs font-normal text-admin-ink-muted">{d.open ? "Abierto" : "Cerrado"}</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  aria-label={`${label}: hora de apertura`}
                  value={d.opensAt}
                  disabled={!d.open}
                  onChange={(e) => patch(d.weekday, { opensAt: e.target.value })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `hours-${d.weekday}-error` : undefined}
                  className={`${inputClass} font-admin-mono`}
                />
                <span className="text-sm text-admin-ink-muted" aria-hidden="true">
                  a
                </span>
                <input
                  type="time"
                  aria-label={`${label}: hora de cierre`}
                  value={d.closesAt}
                  disabled={!d.open}
                  onChange={(e) => patch(d.weekday, { closesAt: e.target.value })}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `hours-${d.weekday}-error` : undefined}
                  className={`${inputClass} font-admin-mono`}
                />
              </div>
              {error ? (
                <p id={`hours-${d.weekday}-error`} className={`${errorTextClass} basis-full`}>
                  {error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-admin-ink-muted">
        Un día cerrado no ofrece entregas ni recogidas, y el asistente lo informa como cerrado.
      </p>
      <ActionStatus message={status} />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-fit`}>
        {pending ? "Guardando..." : "Guardar horario"}
      </button>
    </form>
  );
}
