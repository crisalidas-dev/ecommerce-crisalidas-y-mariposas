"use client";

import { useActionState, useState } from "react";
import { activeLinesOfBrand, type ProductLine } from "@/lib/domain/productLine";
import { VARIANT_NAME_MAX, productSkuPreview, variantNameError, variantSkuPreview } from "@/lib/domain/sku";
import { ActionStatus } from "../../ui/ActionStatus";
import { fieldsetClass, helpTextClass, inputClass, labelClass, primaryButtonClass, selectClass } from "../../ui/formClasses";
import { PhotoPicker } from "../../ui/PhotoPicker";
import { createProduct, type FormState } from "../actions";
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
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [attributeKey, setAttributeKey] = useState("");
  const [stockQty, setStockQty] = useState("0");

  const brandLines = activeLinesOfBrand(lines, brand);
  const line = brandLines.find((l) => l.id === lineChoice) ?? null;
  const productSku = productSkuPreview(brand, line?.code ?? "", name);
  const variantSku = variantSkuPreview(productSku);
  const valueError = variantNameError(attributeValue);

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

          <div className="flex flex-col gap-1 md:col-span-6">
            <label htmlFor="name" className={labelClass}>
              Nombre
            </label>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </div>

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
            <input
              id="basePrice"
              name="basePrice"
              type="number"
              inputMode="numeric"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              min={0}
              step={1}
              required
              className={`${inputClass} font-admin-mono`}
            />
          </div>

          <div className="flex flex-col gap-1 md:col-span-12">
            <label htmlFor="description" className={labelClass}>
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
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
          <div className="flex flex-col gap-1">
            <p className={labelClass}>SKU de la variante</p>
            <output aria-live="polite" className="flex min-h-11 items-center font-admin-mono text-sm font-semibold text-admin-ink">
              {variantSku ?? "—"}
            </output>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="stockQty" className={labelClass}>
              Stock inicial
            </label>
            <input
              id="stockQty"
              name="stockQty"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              required
              className={`${inputClass} font-admin-mono`}
            />
          </div>

          <PhotoPicker className="sm:col-span-2" />
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 md:col-span-5">
        <ActionStatus message={state.error ? { tone: "error", text: state.error } : null} />

        <button type="submit" disabled={pending || !line || Boolean(valueError)} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Creando..." : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
