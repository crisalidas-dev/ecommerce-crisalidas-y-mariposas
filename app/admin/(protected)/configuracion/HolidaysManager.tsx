"use client";

import { useActionState, useState, useTransition } from "react";
import { formatHolidayDate, type HolidayRow } from "@/lib/domain/holidays";
import { ActionStatus, type StatusMessage } from "../ui/ActionStatus";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { fieldsetClass, inputClass, primaryButtonClass, secondaryButtonClass } from "../ui/formClasses";
import { addHoliday, removeHoliday, type HolidayFormState } from "./actions";
import { ConfigField } from "./ConfigField";

export function HolidaysManager({ holidays, today }: { holidays: HolidayRow[]; today: string }) {
  const [state, formAction, pending] = useActionState<HolidayFormState, FormData>(addHoliday, {
    error: null,
    fieldErrors: {},
  });
  // Controlados: React reinicia los campos sin estado tras la acción aunque falle.
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [seenAdded, setSeenAdded] = useState<HolidayFormState | null>(null);
  if (state.added && seenAdded !== state) {
    setSeenAdded(state);
    setDate("");
    setName("");
  }

  const [toRemove, setToRemove] = useState<HolidayRow | null>(null);
  const [removeStatus, setRemoveStatus] = useState<StatusMessage | null>(null);
  const [removing, startRemove] = useTransition();

  function confirmRemove() {
    if (!toRemove) return;
    const target = toRemove;
    startRemove(async () => {
      const res = await removeHoliday(target.holiday_date);
      setRemoveStatus(res.ok ? { tone: "ok", text: "Festivo eliminado" } : { tone: "error", text: res.error });
      setToRemove(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} noValidate aria-busy={pending} className={fieldsetClass}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <ConfigField id="holiday-date" label="Fecha" error={state.fieldErrors.date} className="md:col-span-4">
            <input
              id="holiday-date"
              name="date"
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} font-admin-mono`}
            />
          </ConfigField>
          <ConfigField id="holiday-name" label="Nombre" error={state.fieldErrors.name} className="md:col-span-8">
            <input
              id="holiday-name"
              name="name"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </ConfigField>
        </div>
        <ActionStatus
          message={
            state.error
              ? { tone: "error", text: state.error }
              : state.added
                ? { tone: "ok", text: "Festivo agregado" }
                : null
          }
        />
        <button type="submit" disabled={pending} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Agregando..." : "Agregar festivo"}
        </button>
      </form>

      <div className={fieldsetClass}>
        <ActionStatus message={removeStatus} />
        {holidays.length === 0 ? (
          <p className="text-sm text-admin-ink-muted">No hay festivos próximos registrados.</p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-admin-border overflow-y-auto">
            {holidays.map((h) => (
              <li key={h.holiday_date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-admin-ink">{h.name}</p>
                  <p className="text-xs capitalize text-admin-ink-muted">{formatHolidayDate(h.holiday_date)}</p>
                </div>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  aria-label={`Eliminar festivo ${h.name}`}
                  onClick={() => {
                    setRemoveStatus(null);
                    setToRemove(h);
                  }}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={toRemove !== null}
        title="Eliminar festivo"
        description={
          toRemove
            ? `${toRemove.name} (${formatHolidayDate(toRemove.holiday_date)}) volverá a contar como día hábil si el horario lo abre.`
            : undefined
        }
        confirmLabel="Eliminar"
        tone="danger"
        pending={removing}
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
