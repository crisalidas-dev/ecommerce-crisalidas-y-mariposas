"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { inputClass, labelClass } from "./formClasses";

/**
 * Buscador en tiempo real con lista de sugerencias (patrón combobox de ARIA):
 * flechas, Enter, Escape y aria-activedescendant. Mientras no se elija una
 * opción de la lista, `value` es "". Editar el texto deshace la elección.
 * La lista solo aparece al escribir; sin resultados se muestra `emptyState`
 * fuera de la lista, así un enlace dentro sigue siendo alcanzable con Tab.
 */
export function SearchCombobox<T>({
  options,
  search,
  getKey,
  getInputLabel,
  renderOption,
  value,
  onChange,
  label,
  hideLabel = false,
  listLabel,
  placeholder,
  emptyState = () => "Sin coincidencias",
  hiddenName,
  requiredMessage,
  className = "",
}: {
  options: T[];
  /** Filtra y ordena las opciones para el texto escrito (puro, en lib/domain). */
  search: (options: T[], query: string) => T[];
  getKey: (option: T) => string;
  /** Texto que queda en el campo al elegir. */
  getInputLabel: (option: T) => string;
  renderOption: (option: T) => ReactNode;
  value: string;
  onChange: (key: string) => void;
  label: string;
  hideLabel?: boolean;
  listLabel: string;
  placeholder?: string;
  emptyState?: (query: string) => ReactNode;
  /** Envía la clave elegida en un campo oculto con este nombre. */
  hiddenName?: string;
  /** Si se da, el campo es inválido (validación nativa) mientras no se elija. */
  requiredMessage?: string;
  className?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => getKey(o) === value);
  const [query, setQuery] = useState(selected ? getInputLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = selected ? [] : search(options, query);
  const typed = !selected && query.trim() !== "";
  const showList = open && typed && results.length > 0;

  useEffect(() => {
    if (requiredMessage) inputRef.current?.setCustomValidity(value ? "" : requiredMessage);
  }, [value, requiredMessage]);

  function choose(option: T) {
    onChange(getKey(option));
    setQuery(getInputLabel(option));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) return setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === "Enter" && showList) {
      // Enter elige la opción activa en vez de enviar el formulario.
      e.preventDefault();
      const option = results[active];
      if (option) choose(option);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : labelClass}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
            if (value) onChange("");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`${inputClass} w-full`}
        />
        {hiddenName ? <input type="hidden" name={hiddenName} value={value} /> : null}
        {showList ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={listLabel}
            className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-admin-border bg-admin-surface-raised py-1 shadow-admin-card"
          >
            {results.map((option, i) => (
              <li
                key={getKey(option)}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown en vez de click: elige antes de que el blur cierre la lista.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm text-admin-ink ${
                  i === active ? "bg-admin-surface-sunken" : ""
                }`}
              >
                {renderOption(option)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {typed && results.length === 0 ? (
        <div role="status" className="text-sm text-admin-ink-muted">
          {emptyState(query.trim())}
        </div>
      ) : null}
    </div>
  );
}
