import { CHRYSALIS_COUNT_MAX } from "@/lib/domain/chrysalis";
import { helpTextClass, inputClass, labelClass } from "../ui/formClasses";

/**
 * Crisálidas por unidad de la variante (product_variants.chrysalis_count).
 * Solo se muestra en productos de Crisálidas; lo usan el alta del producto y
 * "Agregar variante". El valor se valida con parseChrysalisCount.
 */
export function ChrysalisCountField({
  id,
  name,
  value,
  onChange,
  className = "",
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className={labelClass}>
        Crisálidas que lleva
      </label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={CHRYSALIS_COUNT_MAX}
        step={1}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-help`}
        className={`${inputClass} w-28 font-admin-mono`}
      />
      <p id={`${id}-help`} className={helpTextClass}>
        Por unidad de esta variante. Lo usa producción.
      </p>
    </div>
  );
}
