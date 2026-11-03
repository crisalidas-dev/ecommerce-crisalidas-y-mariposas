/**
 * Interruptor encendido/apagado (role="switch"). Área táctil de 44px; la pista
 * y el botón animan 200 ms y no animan con prefers-reduced-motion.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Nombre accesible, p. ej. "Variante activa: color blanco". */
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-accent disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${
          checked ? "bg-admin-accent" : "bg-admin-surface-sunken ring-1 ring-admin-border-strong"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-admin-surface shadow-admin-card transition-transform duration-200 motion-reduce:transition-none ${
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
