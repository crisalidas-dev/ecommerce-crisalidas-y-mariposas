import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { errorTextClass, helpTextClass, labelClass } from "../ui/formClasses";

/** Label + control + hint/error, wiring `aria-describedby` and `aria-invalid` to the control. */
export function ConfigField({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {isValidElement(children) && describedBy
        ? cloneElement(children as ReactElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>, {
            "aria-describedby": describedBy,
            ...(error ? { "aria-invalid": true } : {}),
          })
        : children}
      {error ? (
        <p id={`${id}-error`} className={errorTextClass}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={helpTextClass}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
