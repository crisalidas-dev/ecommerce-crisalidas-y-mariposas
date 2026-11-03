"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { postgrestErrorMessage, rpcErrorMessage } from "@/lib/domain/stockRecipe";
import { clearImage, storeImage } from "@/lib/admin/imageStorage";
import { optionalImageFile, validateImageFile } from "@/lib/domain/imageUpload";
import { parseNewLineInput, type ProductLine } from "@/lib/domain/productLine";
import { variantNameError } from "@/lib/domain/sku";

/** Techos de precio de Crisálidas (spec 001 §4.1) — advertencia, no bloqueo
 * (spec 002 §3.4.3): no hay CHECK en la base, así que tampoco lo hay aquí. */
const CRISALIDAS_PRICE_CEILING: Record<string, number> = {
  "Pequeños Milagros": 100000,
  "Instantes de Vida": 200000,
  "Grandes Transformaciones": 300000,
  "Experiencias de Colección": 350000,
};

export type FormState = { error: string | null; warning?: string | null };

const createProductSchema = z.object({
  lineId: z.string().uuid("Elige la línea del producto."),
  name: z.string().trim().min(1, "El nombre del producto es obligatorio."),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  basePrice: z.coerce.number().int().nonnegative(),
  attributeKey: z.string().trim().optional(),
  attributeValue: z.string().trim().optional(),
  stockQty: z.coerce.number().int().nonnegative(),
});

type RpcResult = { ok?: boolean; error?: string; mensaje?: string } | null;

export async function createProductLine(input: {
  brand: string;
  name: string;
  code: string;
}): Promise<{ ok: true; line: ProductLine } | { ok: false; error: string }> {
  const parsed = parseNewLineInput(input);
  if (!parsed.ok) return parsed;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("product_lines")
    .insert(parsed.data)
    .select("id, brand, code, name, is_active")
    .single();
  if (error) return { ok: false, error: postgrestErrorMessage(error) };

  revalidatePath("/admin/productos/nuevo");
  return { ok: true, line: data };
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const input = parsed.data;

  const attributes =
    input.attributeKey && input.attributeValue ? { [input.attributeKey]: input.attributeValue } : {};
  const nameError = variantNameError(input.attributeValue ?? "");
  if (nameError) return { error: nameError };

  // La foto es opcional; se valida antes de crear nada para no dejar un producto a medias.
  const photo = optionalImageFile(formData.get("photo"));
  if (photo) {
    const check = validateImageFile(photo);
    if (!check.ok) return { error: check.error };
  }

  const supabase = createAdminClient();

  // La base genera los SKU y crea producto + primera variante en una transacción.
  const { data, error } = await supabase.rpc("create_product_with_variant", {
    p_line_id: input.lineId,
    p_name: input.name,
    p_base_price: input.basePrice,
    p_description: input.description || null,
    p_category: input.category || null,
    p_attributes: attributes,
    p_stock_qty: input.stockQty,
  });
  const result = data as
    | (RpcResult & { product_sku?: string; brand?: string; variant_id?: string })
    | null;

  if (error || !result?.ok || !result.product_sku || !result.variant_id) {
    return { error: `No se pudo crear el producto: ${rpcErrorMessage(result?.error, result?.mensaje ?? error?.message)}` };
  }

  let warning: string | null = null;
  if (result.brand === "crisalidas" && input.category) {
    const ceiling = CRISALIDAS_PRICE_CEILING[input.category];
    if (ceiling && input.basePrice > ceiling) {
      warning = `El precio supera el techo de "${input.category}" (${ceiling.toLocaleString("es-CO")} COP) — se guardó igual.`;
    }
  }

  // Si la foto falla, el producto ya existe: no se revierte y la ficha avisa con `?foto=error`.
  let photoFailed = false;
  if (photo) {
    const res = await storeImage({ table: "product_variants", folder: "variants", id: result.variant_id }, photo);
    photoFailed = !res.ok;
  }

  revalidatePath("/admin/productos");

  const query = new URLSearchParams();
  if (warning) query.set("warning", warning);
  if (photoFailed) query.set("foto", "error");
  const qs = query.toString();
  redirect(`/admin/productos/${result.product_sku}${qs ? `?${qs}` : ""}`);
}

export async function setProductPublished(productId: string, published: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ is_published: published })
    .eq("id", productId);
  if (error) throw error;
  revalidatePath("/admin/productos");
}

export async function setVariantActive(
  variantId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ is_active: active })
    .eq("id", variantId);
  // Reactivar puede romper las reglas de nombre de variante (trigger P0001).
  if (error) return { ok: false, error: postgrestErrorMessage(error) };
  revalidatePath("/admin/productos");
  return { ok: true };
}

const createVariantSchema = z.object({
  productId: z.string().uuid(),
  attributeKey: z.string().trim().optional(),
  attributeValue: z.string().trim().optional(),
  stockQty: z.coerce.number().int().nonnegative(),
  // Solo cuando la única variante activa no tiene nombre y hay que nombrarla.
  unnamedAttributeKey: z.string().trim().optional(),
  unnamedAttributeValue: z.string().trim().optional(),
});

export async function createVariant(
  formData: FormData,
): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const parsed = createVariantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const input = parsed.data;

  for (const value of [input.attributeValue, input.unnamedAttributeValue]) {
    const nameError = variantNameError(value ?? "");
    if (nameError) return { ok: false, error: nameError };
  }

  const attributes =
    input.attributeKey && input.attributeValue ? { [input.attributeKey]: input.attributeValue } : {};
  const unnamed =
    input.unnamedAttributeKey || input.unnamedAttributeValue
      ? { [input.unnamedAttributeKey ?? ""]: input.unnamedAttributeValue ?? "" }
      : null;
  if (unnamed && (!input.unnamedAttributeKey || !input.unnamedAttributeValue)) {
    return { ok: false, error: "Indica atributo y valor para nombrar la variante existente." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("create_variant_with_stock", {
    p_product: input.productId,
    p_attributes: attributes,
    p_stock_qty: input.stockQty,
    p_unnamed_variant_attributes: unnamed,
  });
  const result = data as (RpcResult & { sku?: string }) | null;
  if (error || !result?.ok || !result.sku) {
    return { ok: false, error: rpcErrorMessage(result?.error, result?.mensaje ?? error?.message) };
  }

  revalidatePath("/admin/productos");
  return { ok: true, sku: result.sku };
}

export async function uploadVariantImage(
  variantId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await storeImage({ table: "product_variants", folder: "variants", id: variantId }, formData.get("file"));
  if (!res.ok) return res;
  revalidatePath("/admin/productos");
  return { ok: true, url: res.url };
}

export async function removeVariantImage(
  variantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await clearImage({ table: "product_variants", folder: "variants", id: variantId });
  if (!res.ok) return res;
  revalidatePath("/admin/productos");
  return { ok: true };
}
