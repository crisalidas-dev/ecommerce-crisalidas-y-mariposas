import { SHORT_NAME_MAX, shortNameField, textLength } from "@/lib/domain/productSheet";
import { helpTextClass, inputClass, labelClass } from "../ui/formClasses";

/**
 * Nombre y nombre corto: los usan el alta (NewProductForm) y la edición
 * (ProductEditor) con el mismo comportamiento. El nombre corto aparece solo si
 * el nombre pasa de 20 y sigue la sugerencia mientras no se edite
 * (`editedShortName` null); vaciarlo vuelve a seguirla.
 */
export function ProductNameFields({
  name,
  onNameChange,
  editedShortName,
  onEditedShortNameChange,
  shortNameInvalid,
  nameHelp,
  cellClassName = "",
}: {
  name: string;
  onNameChange: (name: string) => void;
  editedShortName: string | null;
  onEditedShortNameChange: (value: string | null) => void;
  shortNameInvalid: boolean;
  nameHelp?: string;
  cellClassName?: string;
}) {
  const shortName = shortNameField(name, editedShortName);
  return (
    <>
      <div className={`flex flex-col gap-1 ${cellClassName}`}>
        <label htmlFor="name" className={labelClass}>
          Nombre
        </label>
        <input
          id="name"
          name="name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          aria-describedby={nameHelp ? "name-help" : undefined}
          className={inputClass}
        />
        {nameHelp ? (
          <p id="name-help" className={helpTextClass}>
            {nameHelp}
          </p>
        ) : null}
      </div>

      {shortName.show ? (
        <div className={`flex flex-col gap-1 ${cellClassName}`}>
          <label htmlFor="shortName" className={labelClass}>
            Nombre corto
          </label>
          <input
            id="shortName"
            name="shortName"
            value={shortName.value}
            onChange={(e) => onEditedShortNameChange(e.target.value.trim() === "" ? null : e.target.value)}
            maxLength={SHORT_NAME_MAX}
            required
            aria-describedby="shortName-help"
            aria-invalid={shortName.value.trim() && shortNameInvalid ? true : undefined}
            className={inputClass}
          />
          <p id="shortName-help" className={helpTextClass}>
            Título del botón del producto en WhatsApp (el nombre pasa de {SHORT_NAME_MAX} caracteres). Se sugirió a
            partir del nombre: revísalo · {textLength(shortName.value.trim())}/{SHORT_NAME_MAX}
          </p>
        </div>
      ) : null}
    </>
  );
}
