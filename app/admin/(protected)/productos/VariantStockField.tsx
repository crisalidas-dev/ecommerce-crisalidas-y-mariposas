import { VARIANT_STOCK_MAX } from "@/lib/domain/variantStock";
import { helpTextClass, inputClass, labelClass } from "../ui/formClasses";

/**
 * Initial stock of a variant (product_variants.stock_qty). Optional: empty
 * means 0. Used by the new-product form and "Agregar variante"; the value is
 * validated with parseVariantStock.
 */
export function VariantStockField({
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
        Stock inicial
      </label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={VARIANT_STOCK_MAX}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-help`}
        className={`${inputClass} w-28 font-admin-mono`}
      />
      <p id={`${id}-help`} className={helpTextClass}>
        Opcional. Vacío = 0.
      </p>
    </div>
  );
}
