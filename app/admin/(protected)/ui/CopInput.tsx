"use client";

import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { caretAfterDigits, formatCopAmount, parseCopAmount } from "@/lib/domain/copAmount";
import { inputClass } from "./formClasses";

type NativeProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange" | "name"
>;

/**
 * Monto en pesos enteros (COP). Se ve con separador de miles es-CO
 * ("150.000") mientras se escribe; solo acepta dígitos. Con `name`, un input
 * oculto envía el entero sin formato, así el servidor recibe solo dígitos
 * (igual que el antiguo type="number"). Sin `name`, se usa controlado con
 * `value`/`onChange` (entero o null).
 */
export function CopInput({
  value,
  onChange,
  name,
  className,
  ...props
}: NativeProps & {
  value: number | null;
  onChange: (value: number | null) => void;
  name?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Dígitos a la izquierda del cursor tras la última edición: el cursor se
  // vuelve a ubicar después de ellos cuando el texto se reformatea.
  const pendingCaret = useRef<number | null>(null);
  const formatted = formatCopAmount(value);

  useLayoutEffect(() => {
    const input = ref.current;
    if (!input || pendingCaret.current === null || document.activeElement !== input) return;
    const position = caretAfterDigits(formatted, pendingCaret.current);
    input.setSelectionRange(position, position);
    pendingCaret.current = null;
  }, [formatted]);

  return (
    <>
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={formatted}
        onChange={(e) => {
          const next = parseCopAmount(e.target.value);
          // Por encima del máximo se ignora la tecla y se conserva el valor.
          if (next === undefined) return;
          const caret = e.target.selectionStart ?? e.target.value.length;
          pendingCaret.current = e.target.value.slice(0, caret).replace(/\D/g, "").length;
          onChange(next);
        }}
        onKeyDown={(e) => {
          props.onKeyDown?.(e);
          // Borrar justo sobre un separador borra el dígito vecino, no el punto
          // (que el formato volvería a poner).
          const input = e.currentTarget;
          const start = input.selectionStart;
          if (start === null || start !== input.selectionEnd) return;
          if (e.key === "Backspace" && start > 0 && !/\d/.test(input.value[start - 1])) {
            input.setSelectionRange(start - 1, start - 1);
          } else if (e.key === "Delete" && start < input.value.length && !/\d/.test(input.value[start])) {
            input.setSelectionRange(start + 1, start + 1);
          }
        }}
        className={className ?? `${inputClass} font-admin-mono`}
      />
      {name ? <input type="hidden" name={name} value={value === null ? "" : String(value)} /> : null}
    </>
  );
}
