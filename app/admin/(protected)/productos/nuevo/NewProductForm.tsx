"use client";

import { useActionState, useState } from "react";
import { activeLinesOfBrand, type ProductLine } from "@/lib/domain/productLine";
import { productSheetErrors, shortNameField } from "@/lib/domain/productSheet";
import { VARIANT_NAME_MAX, productSkuPreview, variantNameError, variantSkuPreview } from "@/lib/domain/sku";
import { ActionStatus } from "../../ui/ActionStatus";
import { CopInput } from "../../ui/CopInput";
import { fieldsetClass, helpTextClass, inputClass, labelClass, primaryButtonClass, selectClass } from "../../ui/formClasses";
import { PhotoPicker } from "../../ui/PhotoPicker";
import { createProduct, type FormState } from "../actions";
import { DescriptionField, SimbolismoField } from "../ProductCopyFields";
import { ProductNameFields } from "../ProductNameFields";
import { ChrysalisCountField } from "../ChrysalisCountField";
import { parseChrysalisCount } from "@/lib/domain/chrysalis";
import { CRISALIDAS_COLLECTIONS, PRODUCT_TYPES } from "../productTypes";
import { SkuHelpButton } from "../SkuHelpButton";
import { LineSelector, NEW_LINE } from "./LineSelector";

const initialState: FormState = { error: null };

/**
 * El SKU lo genera la base de datos; aquí solo se muestra una vista previa en
 * vivo (la final puede llevar `-2` si el nombre ya existe en la línea).
 */
export function NewProductForm({ lines: initialLines }: { lines: ProductLine[] }) {
  const [state, formAction, pending] = useActionState(createProduct, initialState);

  const [brand, setBrand] = useState("crisalidas");
  const [lines, setLines] = useState(initialLines);
  const [lineChoice, setLineChoice] = useState("");
  const [name, setName] = useState("");
  // Todos los campos son controlados: React reinicia los no controlados tras la
  // acción aunque devuelva un error y se perdería lo escrito.
  const [attributeValue, setAttributeValue] = useState("");
  const [description, setDescription] = useState("");
  const [simbolismo, setSimbolismo] = useState("");
  // Mientras no se edite a mano, el nombre corto sigue la sugerencia derivada
  // del nombre; vaciarlo vuelve a seguirla.
  const [editedShortName, setEditedShortName] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [attributeKey, setAttributeKey] = useState("");
  const [chrysalisCount, setChrysalisCount] = useState("");

  const brandLines = activeLinesOfBrand(lines, brand);
  const line = brandLines.find((l) => l.id === lineChoice) ?? null;
  const productSku = productSkuPreview(brand, line?.code ?? "", name);
  const variantSku = variantSkuPreview(productSku);
  const valueError = variantNameError(attributeValue);
  // El nombre corto solo se pide cuando el nombre no cabe en el botón de WhatsApp.
  const shortName = shortNameField(name, editedShortName);
  const sheetErrors = productSheetErrors({ brand, name, simbolismo, shortName: shortName.value });
  const sheetInvalid = Boolean(sheetErrors.simbolismo || sheetErrors.shortName);
  // Solo Crisálidas lleva crisálidas; en Complementos el campo no existe.
  const chrysalisInvalid = !parseChrysalisCount(brand, brand === "crisalidas" ? chrysalisCount : "").ok;

  return (
    <form action={formAction} className="grid grid-cols-1 gap-6 md:grid-cols-5">
      <fieldset className={`${fieldsetClass} min-w-0 md:col-span-3`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Producto</legend>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="flex flex-col gap-1 md:col-span-6">
            <label htmlFor="brand" className={labelClass}>
              Tipo de producto
            </label>
            <select
              id="brand"
              name="brand"
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setLineChoice("");
              }}
              className={selectClass}
            >
              {PRODUCT_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {brand === "crisalidas" ? (
            <div className="flex flex-col gap-1 md:col-span-6">
              <label htmlFor="category" className={labelClass}>
                Colección (franja comercial)
              </label>
              <select
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={selectClass}
              >
                <option value="">Sin colección</option>
                {CRISALIDAS_COLLECTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="md:col-span-12">
            <LineSelector
              brand={brand}
              lines={brandLines}
              value={lineChoice}
              onChange={setLineChoice}
              onCreated={(created) => {
                setLines((prev) => [...prev, created]);
                setLineChoice(created.id);
              }}
            />
            <input type="hidden" name="lineId" value={lineChoice === NEW_LINE ? "" : lineChoice} />
          </div>

          <ProductNameFields
            name={name}
            onNameChange={setName}
            editedShortName={editedShortName}
            onEditedShortNameChange={setEditedShortName}
            shortNameInvalid={Boolean(sheetErrors.shortName)}
            cellClassName="md:col-span-6"
          />

          <div className="flex flex-col gap-1 md:col-span-6">
            <p className={labelClass}>
              SKU que se asignará
            </p>
            <div className="flex min-h-11 items-center gap-2">
              <output
                aria-live="polite"
                className="font-admin-mono text-sm font-semibold text-admin-ink"
              >
                {productSku ?? "—"}
              </output>
              <SkuHelpButton brand={brand} lineCode={line?.code} name={name} />
            </div>
            <p className={helpTextClass}>Lo genera el sistema. Si ya existe, se agrega -2.</p>
          </div>

          <div className="flex flex-col gap-1 md:col-span-6">
            <label htmlFor="basePrice" className={labelClass}>
              Precio base (COP)
            </label>
            <CopInput id="basePrice" name="basePrice" value={basePrice} onChange={setBasePrice} required />
          </div>

          <DescriptionField value={description} onChange={setDescription} className="md:col-span-12" />

          {brand === "crisalidas" ? (
            <SimbolismoField value={simbolismo} onChange={setSimbolismo} className="md:col-span-12" />
          ) : null}
        </div>
      </fieldset>

      <fieldset className={`${fieldsetClass} min-w-0 md:col-span-2 md:self-start`}>
        <legend className="px-1 text-sm font-semibold text-admin-ink">Variante inicial</legend>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="attributeKey" className={labelClass}>
              Atributo
            </label>
            <input
              id="attributeKey"
              name="attributeKey"
              value={attributeKey}
              onChange={(e) => setAttributeKey(e.target.value)}
              aria-describedby="attributeKey-help"
              className={inputClass}
            />
            <p id="attributeKey-help" className={helpTextClass}>
              Opcional, ej. color
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="attributeValue" className={labelClass}>
              Valor
            </label>
            <input
              id="attributeValue"
              name="attributeValue"
              value={attributeValue}
              onChange={(e) => setAttributeValue(e.target.value)}
              maxLength={VARIANT_NAME_MAX}
              aria-describedby="attributeValue-help"
              aria-invalid={valueError ? true : undefined}
              className={inputClass}
            />
            <p id="attributeValue-help" className={helpTextClass}>
              ej. blanco · es el nombre que ve el cliente en WhatsApp (máx. {VARIANT_NAME_MAX})
            </p>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <p className={labelClass}>SKU de la variante</p>
            <output aria-live="polite" className="flex min-h-11 items-center font-admin-mono text-sm font-semibold text-admin-ink">
              {variantSku ?? "—"}
            </output>
            <p className={helpTextClass}>
              La disponibilidad se calcula con los componentes (insumos) del producto: se asignan en el editor del
              producto después de crearlo.
            </p>
          </div>

          {brand === "crisalidas" ? (
            <ChrysalisCountField
              id="chrysalisCount"
              name="chrysalisCount"
              value={chrysalisCount}
              onChange={setChrysalisCount}
              className="sm:col-span-2"
            />
          ) : null}

          <PhotoPicker className="sm:col-span-2" />
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 md:col-span-5">
        <ActionStatus message={state.error ? { tone: "error", text: state.error } : null} />

        <button type="submit" disabled={pending || !line || Boolean(valueError) || sheetInvalid || chrysalisInvalid} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Creando..." : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
