"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Dialog } from "../../ui/Dialog";
import { focusRingClass, secondaryButtonClass } from "../../ui/formClasses";

export interface InsumoDialogData {
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  stockQty: number;
  isActive: boolean;
  movements: { id: string; delta: number; stockAfter: number; reason: string; createdAt: string }[];
}

const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wide text-admin-ink-muted";

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

/**
 * "Ver más detalles" de un insumo, sobre `Dialog` (igual que el de Producción).
 * Con `children`, la tarjeta completa (renderizada en el servidor) es el
 * disparador: un único `<button>`, así que el contenido debe ser inline.
 */
export function InsumoDetailsDialog({
  data,
  children,
}: {
  data: InsumoDialogData;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {children ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={`flex w-full gap-3 rounded-xl border border-transparent bg-admin-surface-raised p-3 text-left shadow-admin-card transition-colors duration-200 hover:border-admin-border-strong ${focusRingClass}`}
        >
          {children}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
          Ver más detalles
        </button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="xl"
        title={data.name}
        badge={
          <span className="rounded-full bg-admin-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-admin-ink-secondary">
            {data.isActive ? "Activo" : "Inactivo"}
          </span>
        }
        bodyClassName="gap-6"
        footer={
          <Link
            href={`/admin/productos/insumos/${encodeURIComponent(data.sku)}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-admin-accent px-3 py-2 text-sm font-medium text-admin-accent-ink transition-opacity duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-accent"
          >
            Editar, ajustar stock o eliminar
          </Link>
        }
      >
        <section className="flex flex-col gap-2" aria-label="Datos">
          <h3 className={SECTION_TITLE}>Datos</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <Field label="Unidad" value={data.unit} />
            <Field label="Stock" value={String(data.stockQty)} mono />
          </dl>
          <dl>
            <Field label="Descripción" value={data.description?.trim() || "—"} />
          </dl>
        </section>

        <section className="flex flex-col gap-2" aria-label="Movimientos recientes">
          <h3 className={SECTION_TITLE}>Últimos movimientos</h3>
          {data.movements.length === 0 ? (
            <p className="text-sm text-admin-ink-muted">Sin movimientos.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {data.movements.map((m) => (
                <li key={m.id} className="flex flex-wrap items-baseline gap-x-3 text-admin-ink-secondary">
                  <span className="text-xs text-admin-ink-muted">{dateFmt.format(new Date(m.createdAt))}</span>
                  <span className="font-admin-mono">{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                  <span className="font-admin-mono text-xs text-admin-ink-muted">→ {m.stockAfter}</span>
                  <span>{m.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Dialog>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-admin-ink-muted">{label}</dt>
      <dd
        className={`whitespace-pre-wrap break-words ${
          value === "—" ? "text-admin-ink-muted" : "text-admin-ink-secondary"
        } ${mono ? "font-admin-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
