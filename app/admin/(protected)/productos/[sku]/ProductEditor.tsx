"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import type { ProductDetail, VariantRow } from "@/lib/data/admin-products";
import { parseVariantStock } from "@/lib/domain/variantStock";
import {
  createVariant,
  deleteProduct,
  deleteVariant,
  removeVariantImage,
  setProductPublished,
  setVariantActive,
  updateProductBasePrice,
  updateProductCopy,
  updateProductName,
  updateVariantAttributes,
  updateVariantChrysalisCount,
  updateVariantStock,
  uploadVariantImage,
} from "../actions";
import { parseProductCopy, parseProductName, shortNameField } from "@/lib/domain/productSheet";
import {
  unpublishedNotice,
  variantAvailabilityLabel,
  variantDeleteBlock,
  variantStatusDisplay,
} from "@/lib/domain/publishReadiness";
import { DescriptionField, SimbolismoField } from "../ProductCopyFields";
import { ProductNameFields } from "../ProductNameFields";
import { ChrysalisCountField } from "../ChrysalisCountField";
import { VariantStockField } from "../VariantStockField";
import { parseChrysalisCount } from "@/lib/domain/chrysalis";
import { CopInput } from "../../ui/CopInput";
import { PhotoPicker } from "../../ui/PhotoPicker";
import { Switch } from "../../ui/Switch";
import {
  VARIANT_NAME_MAX,
  attributeKeySuggestion,
  canActivateVariant,
  nextVariantSku,
  parseVariantAttributes,
  renamePrefill,
  unnamedVariantToName,
  variantCardLabel,
  variantNameError,
} from "@/lib/domain/sku";
import { productTypeLabel } from "../productTypes";
import { SkuHelpButton } from "../SkuHelpButton";
import { PublishBadge } from "../PublishBadge";
import { ActionStatus } from "../../ui/ActionStatus";
import { BackLink } from "../../ui/BackLink";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import {
  helpTextClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../ui/formClasses";

const CARD_CLASS = "rounded-xl border border-transparent bg-admin-surface-raised shadow-admin-card";
const PUBLISH_ERROR = "No se pudo cambiar la publicación. Inténtalo de nuevo.";
const VARIANT_ACTIVE_ERROR = "No se pudo cambiar el estado de la variante. Inténtalo de nuevo.";

export function ProductEditor({ product }: { product: ProductDetail }) {
  const [published, setPublished] = useState(product.is_published);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const [pending, startTransition] = useTransition();
  const notice = unpublishedNotice(published, product.variants, product.brand);

  function applyPublished(next: boolean) {
    setPublishError(null);
    startTransition(async () => {
      try {
        await setProductPublished(product.id, next);
        // Solo se refleja el cambio cuando el servidor lo confirmó.
        setPublished(next);
      } catch {
        setPublishError(PUBLISH_ERROR);
      }
    });
  }

  return (
    <div className="animate-view-in flex flex-col gap-6">
      <BackLink href="/admin/productos">Productos</BackLink>
      <div className={`flex flex-wrap items-center justify-between gap-3 p-4 ${CARD_CLASS}`}>
        <div>
          <h1 className="text-lg font-semibold text-admin-ink">{product.name}</h1>
          <p className="text-xs text-admin-ink-muted">
            {productTypeLabel(product.brand, product.category)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PublishBadge published={published} />
          <button
            type="button"
            disabled={pending}
            onClick={() => (published ? setConfirmingUnpublish(true) : applyPublished(true))}
            className={secondaryButtonClass}
          >
            {published ? "Despublicar" : "Publicar"}
          </button>
        </div>
        <ActionStatus
          message={publishError ? { tone: "error", text: publishError } : null}
          className="w-full text-xs"
        />
        {/* Se crea sin publicar: hay que revisar el stock de cada variante antes de mostrarla. */}
        <ActionStatus
          message={notice ? { tone: "warn", text: notice } : null}
          className="w-full text-sm"
        />
        <ConfirmDialog
          open={confirmingUnpublish}
          title={`¿Despublicar ${product.name}?`}
          description="El producto dejará de verse en la tienda. Puedes volver a publicarlo cuando quieras."
          confirmLabel="Despublicar"
          tone="danger"
          onCancel={() => setConfirmingUnpublish(false)}
          onConfirm={() => {
            setConfirmingUnpublish(false);
            applyPublished(false);
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ProductNameForm product={product} />
        <ProductPriceForm product={product} />
      </div>

      <ProductCopyForm product={product} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-admin-ink">Variantes</h2>
        {product.variants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            productPublished={published}
            carriesChrysalis={product.brand === "crisalidas"}
            variantCount={product.variants.length}
            siblings={product.variants}
          />
        ))}
        {product.variants.length === 0 ? (
          <p className="text-sm text-admin-ink-muted">Sin variantes todavía.</p>
        ) : null}
      </div>

      <AddVariantForm
        productId={product.id}
        productSku={product.sku}
        variants={product.variants}
        lastVariantNumber={product.lastVariantNumber}
        carriesChrysalis={product.brand === "crisalidas"}
      />

      <DangerZone product={product} />
    </div>
  );
}

/** Nombre y nombre corto. El SKU no cambia al renombrar. */
function ProductNameForm({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  // Un nombre corto ya guardado arranca como editado: la sugerencia no lo pisa.
  const [editedShortName, setEditedShortName] = useState<string | null>(product.short_name);
  const [saved, setSaved] = useState({ name: product.name, shortName: product.short_name ?? "" });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const shortName = shortNameField(name, editedShortName);
  const check = parseProductName(name, shortName.value);
  const dirty = check.ok
    ? check.data.name !== saved.name || (check.data.shortName ?? "") !== saved.shortName
    : name.trim() !== saved.name;

  return (
    <form
      className={`flex flex-col gap-4 p-4 ${CARD_CLASS}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!check.ok) return;
        setMessage(null);
        startTransition(async () => {
          try {
            const res = await updateProductName(product.id, name, shortName.show ? shortName.value : null);
            if (res.error) {
              setMessage({ tone: "error", text: res.error });
              return;
            }
            setSaved({ name: check.data.name, shortName: check.data.shortName ?? "" });
            setMessage({ tone: "ok", text: "Nombre guardado" });
            router.refresh();
          } catch {
            setMessage({ tone: "error", text: "No se pudo guardar el nombre. Inténtalo de nuevo." });
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold text-admin-ink">Nombre</h2>
      <ProductNameFields
        name={name}
        onNameChange={setName}
        editedShortName={editedShortName}
        onEditedShortNameChange={setEditedShortName}
        shortNameInvalid={!check.ok}
        nameHelp="El SKU no cambia al renombrar."
      />
      {!check.ok && name.trim() ? <p className={`${helpTextClass} text-admin-warning-fg`}>{check.error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !dirty || !check.ok} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Guardando..." : "Guardar nombre"}
        </button>
        <ActionStatus message={message} className="text-sm" />
      </div>
    </form>
  );
}

/** Precio base: aplica a todas las variantes (precio = base + price_delta). */
function ProductPriceForm({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const [basePrice, setBasePrice] = useState<number | null>(product.base_price);
  const [saved, setSaved] = useState(product.base_price);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = basePrice !== null && basePrice !== saved;

  return (
    <form
      className={`flex flex-col gap-4 p-4 ${CARD_CLASS}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (basePrice === null) return;
        setMessage(null);
        startTransition(async () => {
          try {
            const res = await updateProductBasePrice(product.id, basePrice);
            if (res.error) {
              setMessage({ tone: "error", text: res.error });
              return;
            }
            setSaved(basePrice);
            setMessage(res.warning ? { tone: "warn", text: res.warning } : { tone: "ok", text: "Precio guardado" });
            router.refresh();
          } catch {
            setMessage({ tone: "error", text: "No se pudo guardar el precio. Inténtalo de nuevo." });
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold text-admin-ink">Precio</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="editBasePrice" className={labelClass}>
          Precio base (COP)
        </label>
        <CopInput
          id="editBasePrice"
          value={basePrice}
          onChange={setBasePrice}
          required
          aria-describedby="editBasePrice-help"
        />
        <p id="editBasePrice-help" className={helpTextClass}>
          Aplica a todas las variantes. Los pedidos ya creados conservan su precio.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !dirty} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Guardando..." : "Guardar precio"}
        </button>
        <ActionStatus message={message} className="text-sm" />
      </div>
    </form>
  );
}

/** Eliminar solo sin pedidos; con pedidos se despublica. La base lo vuelve a comprobar (delete_product). */
function DangerZone({ product }: { product: ProductDetail }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-labelledby="danger-zone-title"
      className="flex flex-col gap-3 rounded-xl border border-admin-critical-fg/40 bg-admin-surface-raised p-4"
    >
      <h2 id="danger-zone-title" className="text-sm font-semibold text-admin-critical-fg">
        Zona de peligro
      </h2>
      {product.hasOrderHistory ? (
        <p id="delete-help" className={helpTextClass}>
          Este producto tiene pedidos: no se puede eliminar. Si no quieres que se vea en la tienda, usa
          &quot;Despublicar&quot; arriba.
        </p>
      ) : (
        <p id="delete-help" className={helpTextClass}>
          Elimina el producto con sus variantes y fotos.
        </p>
      )}
      <button
        type="button"
        disabled={pending || product.hasOrderHistory}
        aria-describedby="delete-help"
        onClick={() => setConfirming(true)}
        className="min-h-11 w-fit rounded-lg bg-admin-critical-bg px-4 py-2 text-sm font-medium text-admin-critical-fg transition-opacity duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-accent disabled:opacity-60"
      >
        {pending ? "Eliminando..." : "Eliminar producto"}
      </button>
      <ActionStatus message={error ? { tone: "error", text: error } : null} className="text-sm" />
      <ConfirmDialog
        open={confirming}
        title={`¿Eliminar ${product.name}?`}
        description={`Se eliminará ${product.name} con sus variantes y fotos. No se puede deshacer.`}
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          setError(null);
          startTransition(async () => {
            // Si se elimina, la acción redirige a /admin/productos.
            const res = await deleteProduct(product.id);
            if (res?.error) setError(res.error);
          });
        }}
      />
    </section>
  );
}

/** Descripción (todas las marcas) y simbolismo (solo Crisálidas), con guardado explícito. */
function ProductCopyForm({ product }: { product: ProductDetail }) {
  const router = useRouter();
  const showSimbolismo = product.brand === "crisalidas";
  const [description, setDescription] = useState(product.description ?? "");
  const [simbolismo, setSimbolismo] = useState(product.simbolismo ?? "");
  // Último valor guardado: sin cambios no hay nada que guardar.
  const [saved, setSaved] = useState({ description: product.description ?? "", simbolismo: product.simbolismo ?? "" });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // El servidor decide con la marca de la base; aquí solo se adelanta el aviso.
  const check = parseProductCopy(product.brand, { description, simbolismo });
  const dirty = description !== saved.description || (showSimbolismo && simbolismo !== saved.simbolismo);

  return (
    <form
      className={`flex flex-col gap-4 p-4 ${CARD_CLASS}`}
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          try {
            const res = await updateProductCopy({
              productId: product.id,
              description,
              simbolismo: showSimbolismo ? simbolismo : undefined,
            });
            if (res.error) {
              setMessage({ tone: "error", text: res.error });
              return;
            }
            setSaved({ description, simbolismo });
            setMessage({ tone: "ok", text: "Ficha guardada" });
            router.refresh();
          } catch {
            setMessage({ tone: "error", text: "No se pudo guardar la ficha. Inténtalo de nuevo." });
          }
        });
      }}
    >
      <h2 className="text-sm font-semibold text-admin-ink">Ficha del producto</h2>
      <DescriptionField value={description} onChange={setDescription} />
      {showSimbolismo ? <SimbolismoField value={simbolismo} onChange={setSimbolismo} /> : null}
      {!check.ok ? <p className={`${helpTextClass} text-admin-warning-fg`}>{check.error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !dirty || !check.ok} className={`${primaryButtonClass} w-fit`}>
          {pending ? "Guardando..." : "Guardar ficha"}
        </button>
        <ActionStatus message={message} className="text-sm" />
      </div>
    </form>
  );
}

function VariantCard({
  variant,
  productPublished,
  carriesChrysalis,
  variantCount,
  siblings,
}: {
  variant: VariantRow;
  productPublished: boolean;
  carriesChrysalis: boolean;
  variantCount: number;
  /** Todas las variantes del producto (incluida esta): deciden el título y si se puede activar. */
  siblings: VariantRow[];
}) {
  const router = useRouter();
  const deleteBlock = variantDeleteBlock(variant, variantCount);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [active, setActive] = useState(variant.is_active);
  const status = variantStatusDisplay(productPublished, active);
  const [imageUrl, setImageUrl] = useState(variant.image_url);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmingRemoveImage, setConfirmingRemoveImage] = useState(false);
  const imageId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [imageBroken, setImageBroken] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const live = { ...variant, is_active: active };
  const title = variantCardLabel(live, siblings);
  const variantLabel = title.unnamed ? variant.sku : title.text;
  // Con otra variante activa, una sin nombre no se puede activar (trigger VARIANTE_SIN_NOMBRE).
  const activation = canActivateVariant(live, siblings);

  function onPickImage(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setError(null);
    setNotice(null);
    setUploading(true);
    startTransition(async () => {
      const res = await uploadVariantImage(variant.id, fd);
      setUploading(false);
      // Permite volver a elegir el mismo archivo después de un error.
      if (fileRef.current) fileRef.current.value = "";
      if (res.ok) {
        setImageUrl(res.url);
        setImageBroken(false);
        setNotice("Imagen actualizada");
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className={`flex flex-col ${CARD_CLASS}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        {/* Foto: miniatura y sus acciones juntas. */}
        <div className="flex items-start gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-admin-surface-sunken">
            {imageUrl && !imageBroken ? (
              <Image
                src={imageUrl}
                alt={variantLabel}
                fill
                sizes="80px"
                className="object-cover"
                onError={() => setImageBroken(true)}
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              id={imageId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Foto de ${variantLabel}`}
              tabIndex={-1}
              onChange={(e) => onPickImage(e.target.files?.[0])}
              className="sr-only"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className={secondaryButtonClass}
            >
              {imageUrl ? "Cambiar foto" : "Subir foto"}
              <span className="sr-only"> de {variantLabel}</span>
            </button>
            {imageUrl ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingRemoveImage(true)}
                className={secondaryButtonClass}
              >
                Eliminar foto<span className="sr-only"> de {variantLabel}</span>
              </button>
            ) : null}
          </div>
        </div>

        <div className={`flex min-w-0 flex-1 flex-col gap-1 ${active ? "" : "opacity-60"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={
                title.text === "Sin nombre"
                  ? "rounded-full bg-admin-warning-bg px-2.5 py-0.5 text-sm font-semibold text-admin-warning-fg"
                  : "text-base font-semibold text-admin-ink"
              }
            >
              {title.text}
            </p>
            {!renaming ? (
              <button type="button" onClick={() => setRenaming(true)} className={secondaryButtonClass}>
                Editar nombre<span className="sr-only"> de {variantLabel}</span>
              </button>
            ) : null}
          </div>
          {renaming ? (
            <VariantNameEditor
              variant={variant}
              siblings={siblings}
              onClose={() => setRenaming(false)}
            />
          ) : null}
          <p className="font-admin-mono text-xs text-admin-ink-secondary">{variant.sku}</p>
          <p className="text-sm text-admin-ink-secondary">{variantAvailabilityLabel(variant)}</p>
          <VariantStockEditor variantId={variant.id} variantLabel={variantLabel} initial={variant.stockQty} />
          {carriesChrysalis ? <ChrysalisCountEditor variantId={variant.id} variantLabel={variantLabel} initial={variant.chrysalisCount} /> : null}
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-admin-ink-secondary">Variante activa</span>
            <Switch
              checked={active}
              disabled={pending || !activation.ok}
              label={`${status.action} ${variantLabel}`}
              onChange={(next) => {
                setActive(next);
                setError(null);
                setNotice(null);
                startTransition(async () => {
                  try {
                    const res = await setVariantActive(variant.id, next);
                    if (!res.ok) {
                      setActive(!next);
                      setError(res.error);
                    }
                  } catch {
                    setActive(!next);
                    setError(VARIANT_ACTIVE_ERROR);
                  }
                });
              }}
            />
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status.tone === "live"
                ? "bg-admin-accent-wash text-admin-accent"
                : status.tone === "warning"
                  ? "bg-admin-warning-bg text-admin-warning-fg"
                  : "bg-admin-surface-sunken text-admin-ink-secondary"
            }`}
          >
            {status.label}
          </span>
          {!activation.ok ? (
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <p className={`${helpTextClass} text-admin-warning-fg`}>{activation.reason}</p>
              <button type="button" onClick={() => setRenaming(true)} className={secondaryButtonClass}>
                Ponerle nombre<span className="sr-only"> a {variantLabel}</span>
              </button>
            </div>
          ) : null}
          {status.note ? <p className={helpTextClass}>{status.note}</p> : null}
          {/* Separado de las acciones de foto y en color de peligro: no se confunde con "Eliminar foto". */}
          <button
            type="button"
            disabled={pending || deleteBlock !== null}
            aria-describedby={deleteBlock ? `${imageId}-delete-why` : undefined}
            onClick={() => setConfirmingDelete(true)}
            className="mt-1 min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-admin-critical-fg ring-1 ring-admin-critical-fg/40 transition-opacity duration-200 hover:bg-admin-critical-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-admin-accent disabled:opacity-60 disabled:hover:bg-transparent"
          >
            Eliminar variante<span className="sr-only"> {variantLabel}</span>
          </button>
          {deleteBlock ? (
            <p id={`${imageId}-delete-why`} className={`${helpTextClass} max-w-[16rem] sm:text-right`}>
              {deleteBlock}
            </p>
          ) : null}
        </div>
      </div>

      <ActionStatus
        message={
          error
            ? { tone: "error", text: error }
            : uploading
              ? { tone: "ok", text: "Subiendo imagen…" }
              : notice
                ? { tone: "ok", text: notice }
                : null
        }
        className="mx-4 mb-3 text-sm"
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={`¿Eliminar la variante ${variantLabel}?`}
        description={`Se eliminará la variante ${title.unnamed ? variant.sku : `${variantLabel} (${variant.sku})`} con su foto. No se puede deshacer.`}
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          setError(null);
          setNotice(null);
          startTransition(async () => {
            try {
              const res = await deleteVariant(variant.id);
              if (res.ok) {
                // La tarjeta desaparece al refrescar: no hace falta otro aviso.
                router.refresh();
              } else {
                setError(res.error);
              }
            } catch {
              setError("No se pudo eliminar la variante. Inténtalo de nuevo.");
            }
          });
        }}
      />

      <ConfirmDialog
        open={confirmingRemoveImage}
        title="¿Eliminar la foto?"
        description={`Se borrará la imagen de ${variantLabel}. Podrás subir otra cuando quieras.`}
        confirmLabel="Eliminar"
        tone="danger"
        onCancel={() => setConfirmingRemoveImage(false)}
        onConfirm={() => {
          setConfirmingRemoveImage(false);
          setError(null);
          setNotice(null);
          startTransition(async () => {
            try {
              const res = await removeVariantImage(variant.id);
              if (res.ok) {
                setImageUrl(null);
                setImageBroken(false);
                setNotice("Imagen eliminada");
              } else {
                setError(res.error);
              }
            } catch {
              setError("No se pudo eliminar la imagen. Inténtalo de nuevo.");
            }
          });
        }}
      />
    </div>
  );
}

/** Atributo + Valor de una variante, en línea. El trigger de la base valida nombres al guardar. */
function VariantNameEditor({
  variant,
  siblings,
  onClose,
}: {
  variant: VariantRow;
  siblings: VariantRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const keyId = useId();
  const valueId = useId();
  const prefill = renamePrefill(variant, siblings);
  const [key, setKey] = useState(prefill.key);
  const [value, setValue] = useState(prefill.value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const check = parseVariantAttributes(key, value, variant.attributes);
  const unchanged = key.trim() === prefill.key && value.trim() === prefill.value;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-admin-border bg-admin-surface p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={keyId} className={labelClass}>
            Atributo
          </label>
          <input
            id={keyId}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="color"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={valueId} className={labelClass}>
            Valor (máx. {VARIANT_NAME_MAX})
          </label>
          <input
            id={valueId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={VARIANT_NAME_MAX}
            placeholder="blanco"
            aria-describedby={`${valueId}-help`}
            className={inputClass}
          />
          <p id={`${valueId}-help`} className={helpTextClass}>
            Es el nombre que ve el cliente en WhatsApp.
          </p>
        </div>
      </div>
      {!check.ok ? <p className={`${helpTextClass} text-admin-warning-fg`}>{check.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !check.ok || unchanged}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                const res = await updateVariantAttributes(variant.id, key, value);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                onClose();
                router.refresh();
              } catch {
                setError("No se pudo guardar el nombre. Inténtalo de nuevo.");
              }
            });
          }}
          className={primaryButtonClass}
        >
          {pending ? "Guardando..." : "Guardar"}
        </button>
        <button type="button" disabled={pending} onClick={onClose} className={secondaryButtonClass}>
          Cancelar
        </button>
      </div>
      <ActionStatus message={error ? { tone: "error", text: error } : null} className="text-sm" />
    </div>
  );
}

/** "Crisálidas: N" con edición en línea (solo Crisálidas). NULL se ve como "sin definir". */
function ChrysalisCountEditor({
  variantId,
  variantLabel,
  initial,
}: {
  variantId: string;
  variantLabel: string;
  initial: number | null;
}) {
  const router = useRouter();
  const inputId = useId();
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const check = parseChrysalisCount("crisalidas", value);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`text-sm ${saved === null ? "rounded-full bg-admin-warning-bg px-2 py-0.5 font-semibold text-admin-warning-fg" : "text-admin-ink-secondary"}`}
        >
          {saved === null ? "Crisálidas: sin definir" : `Crisálidas: ${saved}`}
        </span>
        <button type="button" onClick={() => setEditing(true)} className={secondaryButtonClass}>
          Editar<span className="sr-only"> crisálidas de {variantLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className={labelClass}>
            Crisálidas que lleva
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={value.trim() && !check.ok ? true : undefined}
            className={`${inputClass} w-24 font-admin-mono`}
          />
        </div>
        <button
          type="button"
          disabled={pending || !check.ok}
          onClick={() => {
            if (!check.ok) return;
            setError(null);
            startTransition(async () => {
              try {
                const res = await updateVariantChrysalisCount(variantId, check.value);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                setSaved(check.value);
                setEditing(false);
                router.refresh();
              } catch {
                setError("No se pudo guardar. Inténtalo de nuevo.");
              }
            });
          }}
          className={primaryButtonClass}
        >
          Guardar<span className="sr-only"> crisálidas de {variantLabel}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setError(null);
            setValue(saved === null ? "" : String(saved));
          }}
          className={secondaryButtonClass}
        >
          Cancelar
        </button>
      </div>
      <p className={helpTextClass}>Por unidad de esta variante. Lo usa producción.</p>
      {!check.ok && value.trim() ? <p className={`${helpTextClass} text-admin-warning-fg`}>{check.error}</p> : null}
      <ActionStatus message={error ? { tone: "error", text: error } : null} className="text-sm" />
    </div>
  );
}

/** "Stock: N" with inline edit. Sellable units = stock minus live reservations (`available_units`). */
function VariantStockEditor({
  variantId,
  variantLabel,
  initial,
}: {
  variantId: string;
  variantLabel: string;
  initial: number;
}) {
  const router = useRouter();
  const inputId = useId();
  const [saved, setSaved] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const check = parseVariantStock(value);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-admin-ink-secondary">Stock: {saved}</span>
        <button type="button" onClick={() => setEditing(true)} className={secondaryButtonClass}>
          Editar<span className="sr-only"> stock de {variantLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className={labelClass}>
            Stock de la variante
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={value.trim() && !check.ok ? true : undefined}
            className={`${inputClass} w-24 font-admin-mono`}
          />
        </div>
        <button
          type="button"
          disabled={pending || !check.ok}
          onClick={() => {
            if (!check.ok) return;
            setError(null);
            startTransition(async () => {
              try {
                const res = await updateVariantStock(variantId, check.value);
                if (res.error) {
                  setError(res.error);
                  return;
                }
                setSaved(check.value);
                setEditing(false);
                router.refresh();
              } catch {
                setError("No se pudo guardar. Inténtalo de nuevo.");
              }
            });
          }}
          className={primaryButtonClass}
        >
          Guardar<span className="sr-only"> stock de {variantLabel}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setEditing(false);
            setError(null);
            setValue(String(saved));
          }}
          className={secondaryButtonClass}
        >
          Cancelar
        </button>
      </div>
      <p className={helpTextClass}>Existencias base. Las reservas activas se descuentan al vender.</p>
      {!check.ok && value.trim() ? <p className={`${helpTextClass} text-admin-warning-fg`}>{check.error}</p> : null}
      <ActionStatus message={error ? { tone: "error", text: error } : null} className="text-sm" />
    </div>
  );
}

function AddVariantForm({
  productId,
  productSku,
  variants,
  lastVariantNumber,
  carriesChrysalis,
}: {
  productId: string;
  productSku: string;
  variants: VariantRow[];
  lastVariantNumber: number;
  carriesChrysalis: boolean;
}) {
  // Null mientras no se edite: sigue la clave de la variante actual (paso 1) o la de sus hermanas.
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const [attributeValue, setAttributeValue] = useState("");
  const [chrysalisCount, setChrysalisCount] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [unnamedKey, setUnnamedKey] = useState("");
  const [unnamedValue, setUnnamedValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const keyId = useId();
  const valueId = useId();
  const chrysalisId = useId();
  const stockId = useId();
  const unnamedKeyId = useId();
  const unnamedValueId = useId();
  const [pending, startTransition] = useTransition();

  // Con una sola variante activa y sin nombre, la segunda obliga a nombrar la primera.
  const unnamed = unnamedVariantToName(variants);
  const attributeKey = editedKey ?? (unnamed ? unnamedKey : attributeKeySuggestion(variants));
  const nextSku = nextVariantSku(productSku, variants.map((v) => v.sku), lastVariantNumber);
  const invalid =
    nextSku === null ||
    variantNameError(attributeValue) !== null ||
    variantNameError(unnamedValue) !== null ||
    (unnamed !== null && (unnamedKey.trim() === "" || unnamedValue.trim() === "")) ||
    (unnamed !== null && (attributeKey.trim() === "" || attributeValue.trim() === "")) ||
    !parseVariantStock(stockQty).ok ||
    (carriesChrysalis && !parseChrysalisCount("crisalidas", chrysalisCount).ok);

  const fieldRow = "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start";
  const stepClass = "flex flex-col gap-3 rounded-lg border border-admin-border bg-admin-surface p-4";
  const stepTitle = "text-sm font-semibold text-admin-ink";

  return (
    <form
      aria-labelledby={`${keyId}-title`}
      className="flex flex-col gap-4 rounded-xl border border-dashed border-admin-border-strong bg-admin-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setAdded(false);
        const form = e.currentTarget;
        // Solo PhotoPicker tiene `name` ("photo"); los demás campos son controlados y se agregan aquí.
        const fd = new FormData(form);
        fd.set("productId", productId);
        fd.set("attributeKey", attributeKey);
        fd.set("attributeValue", attributeValue);
        fd.set("stockQty", stockQty);
        if (carriesChrysalis) fd.set("chrysalisCount", chrysalisCount);
        if (unnamed) {
          fd.set("unnamedAttributeKey", unnamedKey);
          fd.set("unnamedAttributeValue", unnamedValue);
        }
        startTransition(async () => {
          const res = await createVariant(fd);
          if (res.ok) {
            setError(null);
            setAdded(true);
            setWarning(res.warning);
            setEditedKey(null);
            setAttributeValue("");
            setChrysalisCount("");
            setStockQty("");
            setUnnamedKey("");
            setUnnamedValue("");
            // PhotoPicker escucha el reset del formulario y vacía archivo y vista previa.
            form.reset();
          } else {
            setError(res.error);
          }
        });
      }}
    >
      <h2 id={`${keyId}-title`} className="text-sm font-semibold text-admin-ink">
        Agregar variante
      </h2>

      {unnamed ? (
        <p
          role="note"
          className="rounded-lg border-l-4 border-admin-accent bg-admin-accent-wash px-3 py-2 text-sm text-admin-ink-secondary"
        >
          Este producto tiene una sola variante sin nombre. Si va a llevar más de una, primero nombra la variante actual
          y luego crea las demás: con 2 o más variantes, todas necesitan nombre porque es lo que ve el cliente en
          WhatsApp.
        </p>
      ) : null}

      {unnamed ? (
        <section aria-labelledby={`${unnamedKeyId}-title`} className={stepClass}>
          <h3 id={`${unnamedKeyId}-title`} className={stepTitle}>
            1. Variante actual{" "}
            <span className="font-admin-mono font-medium break-all text-admin-ink-secondary">{unnamed.sku}</span>
          </h3>
          <div className={fieldRow}>
            <div className="flex flex-col gap-1">
              <label htmlFor={unnamedKeyId} className={labelClass}>
                Atributo
              </label>
              <input
                id={unnamedKeyId}
                value={unnamedKey}
                onChange={(e) => setUnnamedKey(e.target.value)}
                className={inputClass}
                placeholder="color"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={unnamedValueId} className={labelClass}>
                Valor (máx. {VARIANT_NAME_MAX})
              </label>
              <input
                id={unnamedValueId}
                value={unnamedValue}
                onChange={(e) => setUnnamedValue(e.target.value)}
                maxLength={VARIANT_NAME_MAX}
                className={inputClass}
                placeholder="blanco"
                required
              />
            </div>
          </div>
        </section>
      ) : null}

      <section aria-labelledby={`${valueId}-title`} className={stepClass}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={`${valueId}-title`} className={stepTitle}>
            {unnamed ? "2. Nueva variante" : "Nueva variante"}{" "}
            <span className="font-admin-mono font-medium break-all text-admin-ink-secondary">
              {nextSku ?? "sin números disponibles (V99)"}
            </span>
          </h3>
          <SkuHelpButton />
        </div>
        <div className={fieldRow}>
          <div className="flex flex-col gap-1">
            <label htmlFor={keyId} className={labelClass}>
              Atributo
            </label>
            <input
              id={keyId}
              value={attributeKey}
              // Vaciarlo vuelve a seguir la clave sugerida.
              onChange={(e) => setEditedKey(e.target.value === "" ? null : e.target.value)}
              className={inputClass}
              placeholder="color"
              required={unnamed !== null}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={valueId} className={labelClass}>
              Valor (máx. {VARIANT_NAME_MAX})
            </label>
            <input
              id={valueId}
              value={attributeValue}
              onChange={(e) => setAttributeValue(e.target.value)}
              maxLength={VARIANT_NAME_MAX}
              className={inputClass}
              placeholder="azul"
              required={unnamed !== null}
            />
          </div>
          {carriesChrysalis ? (
            <ChrysalisCountField id={chrysalisId} value={chrysalisCount} onChange={setChrysalisCount} />
          ) : null}
          <VariantStockField id={stockId} value={stockQty} onChange={setStockQty} />
        </div>
        <PhotoPicker />
      </section>

      <ActionStatus
        message={
          error
            ? { tone: "error", text: error }
            : added && warning
              ? { tone: "warn", text: `Variante agregada. ${warning}` }
              : added
                ? { tone: "ok", text: "Variante agregada" }
                : null
        }
        className="text-sm"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className={helpTextClass}>
          El stock inicial es opcional (0 si lo dejas vacío); puedes editarlo después en la tarjeta de la variante.
        </p>
        <button type="submit" disabled={pending || invalid} className={`${primaryButtonClass} shrink-0 self-end`}>
          {pending ? "Guardando..." : unnamed ? "Nombrar y agregar variante" : "Agregar variante"}
        </button>
      </div>
    </form>
  );
}
