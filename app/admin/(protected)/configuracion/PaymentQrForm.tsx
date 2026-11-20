"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCatalogDate, formatCatalogSize } from "@/lib/domain/catalogPdf";
import {
  MAX_PAYMENT_QR_BYTES,
  MAX_PAYMENT_QR_MB,
  PAYMENT_QR_NOT_IMAGE,
  PAYMENT_QR_TOO_BIG,
  paymentQrViewUrl,
} from "@/lib/domain/paymentQr";
import { ActionStatus, type StatusMessage } from "../ui/ActionStatus";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { fieldsetClass, focusRingClass, inputClass, primaryButtonClass } from "../ui/formClasses";
import { ConfigField } from "./ConfigField";

export type PaymentQrFileInfo = { size: number; updatedAt: string | null };

const ENDPOINT = "/admin/api/qr-pago";
const ACCEPT = "image/jpeg,image/png,image/webp";

/** Client-side pre-check for fast feedback; the server re-validates the magic bytes. */
function precheck(file: File): string | null {
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_PAYMENT_QR_BYTES) return PAYMENT_QR_TOO_BIG;
  const looksImage = ACCEPT.split(",").includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
  return looksImage ? null : PAYMENT_QR_NOT_IMAGE;
}

export function PaymentQrForm({ publicUrl, file }: { publicUrl: string; file: PaymentQrFileInfo | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

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
        setStatus({ tone: "ok", text: "QR actualizado. El asistente ya comparte la imagen nueva." });
        setSelected(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        setStatus({ tone: "error", text: data?.error ?? "No se pudo subir el QR. El QR publicado sigue siendo el anterior." });
      }
    } catch {
      setStatus({ tone: "error", text: "No se pudo conectar. El QR publicado sigue siendo el anterior." });
    } finally {
      setPending(false);
    }
  }

  const updated = file ? formatCatalogDate(file.updatedAt) : null;
  const viewUrl = file ? paymentQrViewUrl(publicUrl, file.updatedAt) : publicUrl;

  return (
    <div className={fieldsetClass} aria-busy={pending}>
      {file ? (
        <div className="flex flex-wrap items-start gap-4">
          {/* Plain <img>: a cache-busted admin preview of a Storage URL; next/image would re-cache it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewUrl}
            alt="QR de pago publicado actualmente"
            className="h-40 w-40 rounded-lg border border-admin-border bg-admin-surface-raised object-contain"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-admin-ink">QR actual</p>
            <p className="text-xs text-admin-ink-muted">
              {file.size > 0 ? formatCatalogSize(file.size) : "Tamaño no disponible"}
              {updated ? ` · Actualizado ${updated}` : ""}
            </p>
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 inline-block w-fit text-sm font-medium text-admin-accent underline underline-offset-2 ${focusRingClass}`}
            >
              Abrir en una pestaña nueva
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-admin-ink-muted">No hay un QR publicado todavía.</p>
      )}

      <ConfigField
        id="payment-qr-file"
        label="Nuevo QR (imagen)"
        hint={`JPG, PNG o WEBP. Máximo ${MAX_PAYMENT_QR_MB} MB. Reemplaza la imagen actual.`}
        error={fieldError}
      >
        <input
          ref={inputRef}
          id="payment-qr-file"
          type="file"
          accept={ACCEPT}
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
        {pending ? "Subiendo..." : "Reemplazar QR"}
      </button>

      <ConfirmDialog
        open={confirming}
        title="Reemplazar QR"
        description="Esto reemplaza el QR que el asistente comparte por WhatsApp para los pagos."
        confirmLabel="Reemplazar"
        pending={pending}
        onConfirm={upload}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
