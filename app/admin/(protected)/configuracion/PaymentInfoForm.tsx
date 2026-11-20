"use client";

import { useActionState, useState } from "react";
import type { PaymentInfo } from "@/lib/domain/paymentInfo";
import { ActionStatus } from "../ui/ActionStatus";
import { fieldsetClass, inputClass, primaryButtonClass } from "../ui/formClasses";
import { savePaymentInfo, type PaymentInfoFormState } from "./actions";
import { ConfigField } from "./ConfigField";

const SHOWN_TO_CUSTOMERS = "Se comparte tal cual con los clientes por WhatsApp.";

export function PaymentInfoForm({ info }: { info: PaymentInfo }) {
  const [state, formAction, pending] = useActionState<PaymentInfoFormState, FormData>(savePaymentInfo, {
    error: null,
    fieldErrors: {},
  });

  // Controlados: React reinicia los campos sin estado tras la acción aunque falle.
  const [v, setV] = useState({
    banco: info.banco,
    tipoCuenta: info.tipo_cuenta,
    numero: info.numero,
    titular: info.titular,
    nit: info.nit ?? "",
    llave: info.llave ?? "",
  });
  const bind = (key: keyof typeof v) => ({
    name: key,
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((prev) => ({ ...prev, [key]: e.target.value })),
  });
  const err = state.fieldErrors;

  return (
    <form action={formAction} noValidate aria-busy={pending} className="flex flex-col gap-3">
      <fieldset className={`${fieldsetClass} min-w-0 md:grid md:grid-cols-2 md:gap-x-6`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Cuenta bancaria</legend>
        <ConfigField id="pay-banco" label="Banco" error={err.banco} hint={SHOWN_TO_CUSTOMERS}>
          <input id="pay-banco" className={inputClass} {...bind("banco")} />
        </ConfigField>
        <ConfigField id="pay-tipo" label="Tipo de cuenta" error={err.tipoCuenta} hint='Por ejemplo "Ahorros" o "Corriente".'>
          <input id="pay-tipo" className={inputClass} {...bind("tipoCuenta")} />
        </ConfigField>
        <ConfigField id="pay-numero" label="Número de cuenta" error={err.numero} hint={SHOWN_TO_CUSTOMERS}>
          <input id="pay-numero" inputMode="numeric" className={`${inputClass} font-admin-mono`} {...bind("numero")} />
        </ConfigField>
        <ConfigField id="pay-titular" label="Titular" error={err.titular} hint={SHOWN_TO_CUSTOMERS}>
          <input id="pay-titular" className={inputClass} {...bind("titular")} />
        </ConfigField>
        <ConfigField id="pay-nit" label="NIT (opcional)" error={err.nit} hint="Déjalo vacío si no se debe compartir.">
          <input id="pay-nit" className={`${inputClass} font-admin-mono`} {...bind("nit")} />
        </ConfigField>
        <ConfigField
          id="pay-llave"
          label="Llave Bre-B (opcional)"
          error={err.llave}
          hint="Correo, celular o código de la llave. Déjala vacía si no hay una."
        >
          <input id="pay-llave" className={inputClass} {...bind("llave")} />
        </ConfigField>
      </fieldset>

      <ActionStatus
        message={
          state.error
            ? { tone: "error", text: state.error }
            : state.saved
              ? { tone: "ok", text: "Cambios guardados" }
              : null
        }
      />
      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-fit`}>
        {pending ? "Guardando..." : "Guardar datos de pago"}
      </button>
    </form>
  );
}
