import { SKELETON_SURFACE, SkeletonBar, SkeletonShell } from "../ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonShell
      label="Cargando configuración…"
      title="Configuración"
      subtitle={
        <p className="text-sm text-admin-ink-muted">
          Datos del negocio que cita el asistente de WhatsApp, horario de atención y festivos.
        </p>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${SKELETON_SURFACE} flex flex-col gap-3 p-4`}>
            <SkeletonBar className="h-5 w-40" />
            <SkeletonBar className="h-11 w-full" />
            <SkeletonBar className="h-11 w-full" />
          </div>
        ))}
      </div>
    </SkeletonShell>
  );
}
