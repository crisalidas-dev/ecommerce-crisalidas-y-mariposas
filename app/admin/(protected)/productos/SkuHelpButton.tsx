"use client";

import { useState } from "react";
import { brandSkuPrefix, skuSlug } from "@/lib/domain/sku";
import { Dialog } from "../ui/Dialog";
import { focusRingClass } from "../ui/formClasses";

interface Example {
  brand?: string;
  lineCode?: string;
  name?: string;
}

/**
 * Icono de ayuda que abre "¿Cómo se forma el SKU?". El ejemplo se arma con los
 * valores actuales del formulario y cae a un ejemplo fijo mientras falten.
 */
export function SkuHelpButton({ brand, lineCode, name }: Example) {
  const [open, setOpen] = useState(false);
  const prefix = (brand && brandSkuPrefix(brand)) || "CRI";
  const line = lineCode && lineCode.length === 3 ? lineCode : "ARR";
  const slug = (name && skuSlug(name)) || "ENCANTO";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="¿Cómo se forma el SKU?"
        aria-haspopup="dialog"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-admin-border-strong text-xs font-semibold text-admin-ink-secondary hover:text-admin-ink ${focusRingClass}`}
      >
        <span aria-hidden="true">i</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="¿Cómo se forma el SKU?" size="xl">
        <Anatomy parts={[prefix, line, slug, "V01"]} />
        <Section title="Reglas">
          <li>El sistema genera el SKU: no se puede escribir ni cambiar después.</li>
          <li>El nombre se acorta a 12 caracteres, sin tildes ni espacios.</li>
          <li>
            Si ya existe uno igual, se agrega <Mono>-2</Mono> (luego <Mono>-3</Mono>…).
          </li>
          <li>
            Cada variante nueva toma el siguiente número: <Mono>V01</Mono>, <Mono>V02</Mono>… Los números no se
            reutilizan, ni siquiera si la variante se despublica.
          </li>
        </Section>
        <Section title="Líneas">
          <li>
            La línea agrupa productos de una marca (Arreglos, Terrarios, Pines…) y aporta las 3 letras del SKU.
          </li>
          <li>
            Para crear una nueva, elige «+ Nueva línea» al crear el producto: escribe el nombre y confirma el código
            de 3 letras. El código no se puede cambiar después.
          </li>
          <li>
            No repitas la línea en el nombre del producto: «Mariposa Malva» en la línea Pines, no «Pin Mariposa
            Malva».
          </li>
        </Section>
        <Section title="Nombre de la variante">
          <li>Es lo que ve el cliente en los botones de WhatsApp (atributo + valor, por ejemplo «Azul»).</li>
          <li>Es obligatorio cuando el producto tiene 2 o más variantes.</li>
          <li>No puede repetirse dentro del mismo producto y tiene máximo 20 caracteres.</li>
        </Section>
        <Section title="¿Por qué nunca cambia?">
          <li>
            El asistente de WhatsApp, los pedidos y Mercado Pago usan el SKU como identificador. Cambiarlo rompería
            pedidos y conversaciones en curso.
          </li>
        </Section>
      </Dialog>
    </>
  );
}

function Anatomy({ parts }: { parts: string[] }) {
  const labels = ["marca", "línea", "nombre", "variante"];
  const legend = "CRI = Crisálidas y Mariposas, COM = Complementos.";
  return (
    <div className="flex flex-col gap-2">
      <ol aria-label="Partes del SKU" className="flex flex-wrap items-start gap-x-2 gap-y-1">
        {parts.map((part, i) => (
          <li key={labels[i]} className="flex items-start gap-2">
            <span className="flex flex-col items-center gap-0.5">
              <span className="rounded-md bg-admin-surface-sunken px-2 py-1 font-admin-mono text-sm font-semibold text-admin-ink">
                {part}
              </span>
              <span className="text-xs text-admin-ink-muted">{labels[i]}</span>
            </span>
            {i < parts.length - 1 ? (
              <span aria-hidden="true" className="pt-1 font-admin-mono text-admin-ink-muted">
                -
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-xs text-admin-ink-muted">
        {legend}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold text-admin-ink">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-admin-ink-secondary">{children}</ul>
    </section>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-admin-mono text-admin-ink">{children}</span>;
}
