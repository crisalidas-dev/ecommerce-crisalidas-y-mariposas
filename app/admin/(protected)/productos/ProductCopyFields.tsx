import { textLength } from "@/lib/domain/productSheet";
import { helpTextClass, inputClass, labelClass } from "../ui/formClasses";

/**
 * Descripción y simbolismo: los usan el alta (NewProductForm) y la edición
 * (ProductEditor) con el mismo texto de ayuda y el mismo conteo en vivo.
 * Ambos salen en la ficha de la tienda y en la foto de WhatsApp.
 */
type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function DescriptionField({ value, onChange, className }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor="description" className={labelClass}>
        Descripción
      </label>
      <textarea
        id="description"
        name="description"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby="description-help"
        className={inputClass}
      />
      <p id="description-help" className={helpTextClass}>
        Aparece en la ficha del producto en la tienda y en WhatsApp · {textLength(value.trim())} caracteres
      </p>
    </div>
  );
}

export function SimbolismoField({ value, onChange, className }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor="simbolismo" className={labelClass}>
        Simbolismo
      </label>
      <textarea
        id="simbolismo"
        name="simbolismo"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-describedby="simbolismo-help"
        className={inputClass}
      />
      <p id="simbolismo-help" className={helpTextClass}>
        Aparece en la ficha del producto en la tienda y en WhatsApp. Mantenlo breve: la foto en WhatsApp admite unos
        1000 caracteres entre todo y, si no cabe, se recortan la descripción y el simbolismo por frases ·{" "}
        {textLength(value.trim())} caracteres
      </p>
    </div>
  );
}
