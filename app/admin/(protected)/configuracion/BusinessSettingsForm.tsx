"use client";

import { useActionState, useState } from "react";
import type { BusinessSettings } from "@/lib/domain/businessSettings";
import { formatSettingsUpdatedAt } from "@/lib/domain/businessSettings";
import { ActionStatus } from "../ui/ActionStatus";
import { fieldsetClass, inputClass, primaryButtonClass } from "../ui/formClasses";
import { saveBusinessSettings, type SettingsFormState } from "./actions";
import { ConfigField } from "./ConfigField";

const SHOWN_TO_CUSTOMERS = "Se muestra tal cual a los clientes por WhatsApp.";
const URL_HINT = "Enlace completo, con http:// o https://. " + SHOWN_TO_CUSTOMERS;

export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(saveBusinessSettings, {
    error: null,
    fieldErrors: {},
  });

  // Controlados: React reinicia los campos sin estado tras la acción aunque falle.
  const [v, setV] = useState({
    workshopAddress: settings.workshop_address,
    workshopMapsUrl: settings.workshop_maps_url,
    chrysalisWarrantyDays: String(settings.chrysalis_warranty_days),
    termsUrl: settings.terms_url,
    instagramUrl: settings.instagram_url,
    facebookLabel: settings.facebook_label,
    facebookUrl: settings.facebook_url ?? "",
    website: settings.website,
    deliveryRouteDepartureText: settings.delivery_route_departure_text,
  });
  const bind = (key: keyof typeof v) => ({
    name: key,
    value: v[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [key]: e.target.value })),
  });
  const err = state.fieldErrors;

  const updatedAt = formatSettingsUpdatedAt(settings.updated_at);

  return (
    <form action={formAction} noValidate aria-busy={pending} className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <fieldset className={`${fieldsetClass} min-w-0`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Taller</legend>
        <ConfigField id="cfg-address" label="Dirección" error={err.workshopAddress} hint={SHOWN_TO_CUSTOMERS}>
          <textarea id="cfg-address" rows={2} className={inputClass} {...bind("workshopAddress")} />
        </ConfigField>
        <ConfigField id="cfg-maps" label="Enlace de Google Maps" error={err.workshopMapsUrl} hint={URL_HINT}>
          <input id="cfg-maps" type="url" inputMode="url" className={inputClass} {...bind("workshopMapsUrl")} />
        </ConfigField>
      </fieldset>

      <fieldset className={`${fieldsetClass} min-w-0`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Garantía y políticas</legend>
        <ConfigField
          id="cfg-warranty"
          label="Días de garantía de las crisálidas"
          error={err.chrysalisWarrantyDays}
          hint="Número entero mayor que 0. Se cita a los clientes como la garantía si la crisálida no emerge."
        >
          <input id="cfg-warranty" type="number" min={1} step={1} inputMode="numeric" className={`${inputClass} font-admin-mono`} {...bind("chrysalisWarrantyDays")} />
        </ConfigField>
        <ConfigField id="cfg-terms" label="Enlace de términos y condiciones" error={err.termsUrl} hint={URL_HINT}>
          <input id="cfg-terms" type="url" inputMode="url" className={inputClass} {...bind("termsUrl")} />
        </ConfigField>
      </fieldset>

      <fieldset className={`${fieldsetClass} min-w-0`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Redes y web</legend>
        <ConfigField id="cfg-instagram" label="Instagram (enlace)" error={err.instagramUrl} hint={URL_HINT}>
          <input id="cfg-instagram" type="url" inputMode="url" className={inputClass} {...bind("instagramUrl")} />
        </ConfigField>
        <ConfigField id="cfg-fb-label" label="Facebook (texto)" error={err.facebookLabel} hint={`Cómo se nombra Facebook a los clientes. ${SHOWN_TO_CUSTOMERS}`}>
          <input id="cfg-fb-label" className={inputClass} {...bind("facebookLabel")} />
        </ConfigField>
        <ConfigField
          id="cfg-fb-url"
          label="Facebook (enlace, opcional)"
          error={err.facebookUrl}
          hint="Déjalo vacío si solo se debe citar el texto. Si lo llenas, empieza por http:// o https://."
        >
          <input id="cfg-fb-url" type="url" inputMode="url" className={inputClass} {...bind("facebookUrl")} />
        </ConfigField>
        <ConfigField
          id="cfg-website"
          label="Sitio web"
          error={err.website}
          hint="Texto sin espacios, por ejemplo www.crisalidasymariposas.com. No necesita http://."
        >
          <input id="cfg-website" className={inputClass} {...bind("website")} />
        </ConfigField>
      </fieldset>

      <fieldset className={`${fieldsetClass} min-w-0 md:self-start`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Entregas</legend>
        <ConfigField
          id="cfg-route"
          label="Salida de la ruta de domicilios"
          error={err.deliveryRouteDepartureText}
          hint={`Texto libre, por ejemplo "1:00 a 1:30 p.m.". ${SHOWN_TO_CUSTOMERS}`}
        >
          <input id="cfg-route" className={inputClass} {...bind("deliveryRouteDepartureText")} />
        </ConfigField>
      </fieldset>

      <div className="flex flex-col gap-3 md:col-span-2">
        {updatedAt ? (
          <p className="text-xs text-admin-ink-muted">
            Última actualización: <span className="font-admin-mono">{updatedAt}</span>
            {settings.updated_by ? <> por {settings.updated_by}</> : null}
          </p>
        ) : null}
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
          {pending ? "Guardando..." : "Guardar datos del negocio"}
        </button>
      </div>
    </form>
  );
}
