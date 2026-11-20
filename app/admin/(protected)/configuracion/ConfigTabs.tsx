import Link from "next/link";
import { focusRingClass } from "../ui/formClasses";

/** Pestañas "Negocio | Horario de atención" de Configuración: cada una es una ruta propia, como en Inventario. */
export function ConfigTabs({ active }: { active: "negocio" | "horario" }) {
  const tab = (isActive: boolean) =>
    `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 ${focusRingClass} ${
      isActive
        ? "bg-admin-accent text-admin-accent-ink"
        : "text-admin-ink-secondary hover:bg-admin-surface-sunken"
    }`;
  return (
    <nav aria-label="Configuración" className="flex gap-1 rounded-xl bg-admin-surface-raised p-1 ring-1 ring-admin-border w-fit">
      <Link href="/admin/configuracion" aria-current={active === "negocio" ? "page" : undefined} className={tab(active === "negocio")}>
        Negocio
      </Link>
      <Link href="/admin/configuracion/horario" aria-current={active === "horario" ? "page" : undefined} className={tab(active === "horario")}>
        Horario de atención
      </Link>
    </nav>
  );
}
