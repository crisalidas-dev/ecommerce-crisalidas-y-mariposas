"use client";

import { filterVariantBases, type VariantBaseOption } from "@/lib/domain/stockItemCreate";
import { SearchCombobox } from "../../ui/SearchCombobox";

/**
 * Buscador en tiempo real del insumo base de una variante. Envía el id elegido
 * en el campo oculto `variantOf`; mientras no se elija una opción de la lista,
 * el formulario no se puede enviar.
 */
export function VariantBaseCombobox({
  options,
  value,
  onChange,
}: {
  options: VariantBaseOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <SearchCombobox
      options={options}
      search={(all, query) => filterVariantBases(all, query)}
      getKey={(o) => o.id}
      getInputLabel={(o) => `${o.sku} — ${o.name}`}
      renderOption={(o) => (
        <>
          <span className="font-mono text-xs text-admin-ink-muted tabular-nums">{o.sku}</span>
          <span>{o.name}</span>
        </>
      )}
      value={value}
      onChange={onChange}
      label="Insumo base"
      listLabel="Insumos base"
      placeholder="Escribe el SKU o el nombre…"
      hiddenName="variantOf"
      requiredMessage="Elige el insumo base de la lista."
    />
  );
}
