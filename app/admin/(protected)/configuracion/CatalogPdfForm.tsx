"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATALOG_TOO_BIG,
  MAX_CATALOG_BYTES,
  MAX_CATALOG_MB,
  catalogDownloadUrl,
  catalogViewUrl,
  formatCatalogDate,
  formatCatalogSize,
} from "@/lib/domain/catalogPdf";
import { ActionStatus, type StatusMessage } from "../ui/ActionStatus";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  fieldsetClass,
  focusRingClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../ui/formClasses";
import { ConfigField } from "./ConfigField";

export type CatalogFileInfo = { size: number; updatedAt: string | null };

const ENDPOINT = "/admin/api/catalogo-pdf";

/** Client-side pre-check for fast feedback; the server re-validates the magic bytes. */
function precheck(file: File): string | null {
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_CATALOG_BYTES) return CATALOG_TOO_BIG;
  const looksPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return looksPdf ? null : "Selecciona un archivo PDF.";
}

export function CatalogPdfForm({ publicUrl, file }: { publicUrl: string; file: CatalogFileInfo | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setStatus(null);
    const problem = next ? precheck(next) : null;
    setFieldError(problem ?? undefined);
    setSelected(next && !problem ? next : null);
  }

  async function upload() {
    if (!selected) return;
    setConfirming(false);
    setPending(true);
    setStatus(null);
    try {
      const body = new FormData();
      body.append("file", selected);
      const res = await fetch(ENDPOINT, { method: "POST", body });
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        setStatus({ tone: "ok", text: "Catálogo actualizado. El asistente ya envía el archivo nuevo." });
        setSelected(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        setStatus({ tone: "error", text: data?.error ?? "No se pudo subir el catálogo. El catálogo publicado sigue siendo el anterior." });
      }
    } catch {
      setStatus({ tone: "error", text: "No se pudo conectar. El catálogo publicado sigue siendo el anterior." });
    } finally {
      setPending(false);
    }
  }

  const updated = file ? formatCatalogDate(file.updatedAt) : null;
  const viewUrl = file ? catalogViewUrl(publicUrl, file.updatedAt) : publicUrl;

  return (
    <div className={fieldsetClass} aria-busy={pending}>
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-admin-ink">catalogo.pdf</p>
            <p className="text-xs text-admin-ink-muted">
              {file.size > 0 ? formatCatalogSize(file.size) : "Tamaño no disponible"}
              {updated ? ` · Actualizado ${updated}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={previewOpen}
              aria-controls="catalog-preview"
              onClick={() => setPreviewOpen((open) => !open)}
              className={secondaryButtonClass}
            >
              {previewOpen ? "Ocultar vista previa" : "Ver catálogo actual"}
            </button>
            <a
              href={catalogDownloadUrl(publicUrl, file.updatedAt)}
              className={`${secondaryButtonClass} inline-flex items-center`}
            >
              Descargar
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-admin-ink-muted">No hay un catálogo publicado todavía.</p>
      )}

      {file && previewOpen ? (
        <div id="catalog-preview" className="flex flex-col gap-2">
          <iframe
            src={viewUrl}
            title="Vista previa del catálogo actual"
            className="h-[70vh] w-full rounded-lg border border-admin-border bg-admin-surface-raised"
          />
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-fit text-sm font-medium text-admin-accent underline underline-offset-2 ${focusRingClass}`}
          >
            Abrir en una pestaña nueva
          </a>
        </div>
      ) : null}

      <ConfigField
        id="catalog-file"
        label="Nuevo catálogo (PDF)"
        hint={`Máximo ${MAX_CATALOG_MB} MB. Reemplaza el archivo actual.`}
        error={fieldError}
      >
        <input
          ref={inputRef}
          id="catalog-file"
          type="file"
          accept="application/pdf"
          disabled={pending}
          onChange={onPick}
          className={inputClass}
        />
      </ConfigField>

      <ActionStatus message={status} />
      <button
        type="button"
        disabled={!selected || pending}
        onClick={() => setConfirming(true)}
        className={`${primaryButtonClass} w-fit`}
      >
        {pending ? "Subiendo..." : "Reemplazar catálogo"}
      </button>

      <ConfirmDialog
        open={confirming}
        title="Reemplazar catálogo"
        description="Esto reemplaza el catálogo que el asistente envía por WhatsApp."
        confirmLabel="Reemplazar"
        pending={pending}
        onConfirm={upload}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
