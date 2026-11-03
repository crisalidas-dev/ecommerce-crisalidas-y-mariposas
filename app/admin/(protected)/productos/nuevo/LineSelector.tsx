"use client";

import { useId, useState } from "react";
import { formatLineLabel, type ProductLine } from "@/lib/domain/productLine";
import { isValidLineCode, normalizeLineCode, suggestLineCode } from "@/lib/domain/sku";
import { createProductLine } from "../actions";
import { errorTextClass, helpTextClass, inputClass, labelClass, secondaryButtonClass, selectClass } from "../../ui/formClasses";

export const NEW_LINE = "__new__";

/**
 * Selector de línea de la marca elegida, con alta en línea. La lista corta
 * (3-6 líneas por marca) no necesita buscador, por eso es un `<select>` nativo
 * y no el combobox de insumos.
 */
export function LineSelector({
  brand,
  lines,
  value,
  onChange,
  onCreated,
}: {
  brand: string;
  /** Líneas activas de la marca. */
  lines: ProductLine[];
  /** Id de la línea elegida, `NEW_LINE` o vacío. */
  value: string;
  onChange: (value: string) => void;
  onCreated: (line: ProductLine) => void;
}) {
  const selectId = useId();
  const nameId = useId();
  const codeId = useId();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shownCode = codeTouched ? code : suggestLineCode(name);
  const canCreate = name.trim() !== "" && isValidLineCode(shownCode) && !saving;

  async function create() {
    setSaving(true);
    setError(null);
    const res = await createProductLine({ brand, name, code: shownCode });
    setSaving(false);
    if (!res.ok) return setError(res.error);
    onCreated(res.line);
    setName("");
    setCode("");
    setCodeTouched(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className={labelClass}>
          Línea
        </label>
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          className={selectClass}
        >
          <option value="">Elige una línea…</option>
          {lines.map((l) => (
            <option key={l.id} value={l.id}>
              {formatLineLabel(l)}
            </option>
          ))}
          <option value={NEW_LINE}>+ Nueva línea</option>
        </select>
      </div>

      {value === NEW_LINE ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-admin-border-strong p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="flex flex-col gap-1 sm:col-span-3">
              <label htmlFor={nameId} className={labelClass}>
                Nombre de la línea
              </label>
              <input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Arreglos"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label htmlFor={codeId} className={labelClass}>
                Código (3 letras)
              </label>
              <input
                id={codeId}
                value={shownCode}
                onChange={(e) => {
                  setCodeTouched(true);
                  setCode(normalizeLineCode(e.target.value));
                }}
                maxLength={3}
                aria-describedby={`${codeId}-help`}
                className={`${inputClass} font-admin-mono uppercase`}
              />
            </div>
          </div>
          <p id={`${codeId}-help`} className={helpTextClass}>
            El código forma el SKU y no se puede cambiar después. Solo letras A-Z.
          </p>
          {error ? (
            <p role="alert" className={errorTextClass}>
              {error}
            </p>
          ) : null}
          <button type="button" disabled={!canCreate} onClick={create} className={`${secondaryButtonClass} w-fit`}>
            {saving ? "Creando…" : "Crear línea"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
