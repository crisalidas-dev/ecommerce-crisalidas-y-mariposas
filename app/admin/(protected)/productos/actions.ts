"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { postgrestErrorMessage, rpcErrorMessage } from "@/lib/domain/stockErrors";
import { clearImage, removeStoredImages, storeImage } from "@/lib/admin/imageStorage";
import { requireProductEditor } from "@/lib/admin/productGuard";
import { COP_AMOUNT_MAX } from "@/lib/domain/copAmount";
import { priceCeilingWarning } from "@/lib/domain/priceCeiling";
import { parseChrysalisCount } from "@/lib/domain/chrysalis";
import { parseVariantStock } from "@/lib/domain/variantStock";
import { combineWarnings } from "@/lib/domain/actionWarnings";
import { optionalImageFile, validateImageFile } from "@/lib/domain/imageUpload";
import { parseNewLineInput, type ProductLine } from "@/lib/domain/productLine";
import {
  firstProductSheetError,
  parseProductCopy,
  parseProductName,
  productSheetErrors,
  productSheetValues,
} from "@/lib/domain/productSheet";
import { parseVariantAttributes, variantNameError } from "@/lib/domain/sku";

export type FormState = { error: string | null; warning?: string | null };

const createProductSchema = z.object({
  lineId: z.string().uuid("Elige la línea del producto."),
  // Solo para validar antes de llamar a la RPC; la marca real sale de la línea.
  brand: z.string().trim().default(""),
  name: z.string().trim().min(1, "El nombre del producto es obligatorio."),
  shortName: z.string().optional(),
  description: z.string().trim().optional(),
  simbolismo: z.string().optional(),
  category: z.string().trim().optional(),
  basePrice: z.coerce.number().int().nonnegative(),
  attributeKey: z.string().trim().optional(),
  attributeValue: z.string().trim().optional(),
  // Solo Crisálidas; se valida con parseChrysalisCount.
  chrysalisCount: z.string().optional(),
  // Initial stock of the first variant; empty = 0 (parseVariantStock).
  stockQty: z.string().optional(),
});

type RpcResult = { ok?: boolean; error?: string; mensaje?: string } | null;

export async function createProductLine(input: {
  brand: string;
  name: string;
  code: string;
}): Promise<{ ok: true; line: ProductLine } | { ok: false; error: string }> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
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
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  const parsed = createProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const input = parsed.data;

  const attributes =
    input.attributeKey && input.attributeValue ? { [input.attributeKey]: input.attributeValue } : {};
  const nameError = variantNameError(input.attributeValue ?? "");
  if (nameError) return { error: nameError };

  // Simbolismo (Crisálidas) y nombre corto (botón de WhatsApp): la RPC repite
  // estas reglas con la marca de la línea; aquí se evita el viaje.
  const sheetError = firstProductSheetError(productSheetErrors(input));
  if (sheetError) return { error: sheetError };
  const sheet = productSheetValues(input);
  const chrysalis = parseChrysalisCount(input.brand, input.chrysalisCount);
  if (!chrysalis.ok) return { error: chrysalis.error };
  const stock = parseVariantStock(input.stockQty);
  if (!stock.ok) return { error: stock.error };

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
    p_stock_qty: stock.value,
    p_simbolismo: sheet.simbolismo,
    p_short_name: sheet.shortName,
  });
  const result = data as
    | (RpcResult & { product_sku?: string; brand?: string; variant_id?: string })
    | null;

  if (error || !result?.ok || !result.product_sku || !result.variant_id) {
    return { error: `No se pudo crear el producto: ${rpcErrorMessage(result?.error, result?.mensaje ?? error?.message)}` };
  }

  // Techo de precio de Crisálidas: advertencia, no bloqueo (spec 002 §3.4.3).
  const warnings = [priceCeilingWarning(result.brand ?? "", input.category, input.basePrice)];
  // La marca real es la de la línea (result.brand). Ninguna RPC recibe
  // chrysalis_count: se guarda aparte, así que NO es atómico con la creación.
  if (result.brand === "crisalidas") warnings.push(await saveChrysalisCount(result.variant_id, chrysalis.value));
  const warning = combineWarnings(...warnings);

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
  const guard = await requireProductEditor();
  if (!guard.ok) throw new Error(guard.error);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_published: published })
    .eq("id", productId)
    .select("sku")
    .maybeSingle();
  if (error) throw error;
  // Publishing changes what the storefront shows: expire its catalog cache too.
  revalidateProduct((data?.sku as string | undefined) ?? null);
}

/**
 * Lo que ven la tienda y el panel de un producto cambió (ficha, precio, nombre
 * o el producto ya no existe). El catálogo está en unstable_cache (tag
 * storefront-products, 5 min): updateTag lo expira ya. Portada (destacados),
 * catálogo y fichas se regeneran en la próxima visita. n8n lee get_product en
 * vivo: no necesita nada.
 */
function revalidateProduct(sku: string | null) {
  if (sku) revalidatePath(`/admin/productos/${sku}`);
  revalidatePath("/admin/productos");
  updateTag("storefront-products");
  revalidatePath("/");
  revalidatePath("/catalogo");
  revalidatePath("/catalogo/[slug]", "page");
}

/** El producto tal como está en la base: la marca y la colección nunca vienen del cliente. */
async function loadProduct(productId: string) {
  const { data, error } = await createAdminClient()
    .from("products")
    .select("sku, brand, category")
    .eq("id", productId)
    .maybeSingle();
  if (error) return { ok: false as const, error: "No se pudo leer el producto. Inténtalo de nuevo." };
  if (!data) return { ok: false as const, error: rpcErrorMessage("PRODUCTO_NO_EXISTE") };
  return { ok: true as const, product: data as { sku: string; brand: string; category: string | null } };
}

const productIdSchema = z.string().uuid("Producto inválido.");

const updateProductCopySchema = z.object({
  productId: productIdSchema,
  description: z.string().optional(),
  simbolismo: z.string().optional(),
});

/**
 * Edita descripción y simbolismo de un producto existente. La marca se lee de
 * la base por id (nunca del cliente): decide si el simbolismo es obligatorio
 * (Crisálidas) o se guarda null (Complementos).
 */
export async function updateProductCopy(input: {
  productId: string;
  description?: string;
  simbolismo?: string;
}): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  const parsed = updateProductCopySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const loaded = await loadProduct(parsed.data.productId);
  if (!loaded.ok) return { error: loaded.error };

  const copy = parseProductCopy(loaded.product.brand, parsed.data);
  if (!copy.ok) return { error: copy.error };

  const { error } = await createAdminClient()
    .from("products")
    .update({ description: copy.data.description, simbolismo: copy.data.simbolismo })
    .eq("id", parsed.data.productId);
  if (error) return { error: postgrestErrorMessage(error) };

  revalidateProduct(loaded.product.sku);
  return { error: null };
}

const updateBasePriceSchema = z.object({
  productId: productIdSchema,
  basePrice: z
    .number({ message: "Escribe el precio base." })
    .int("El precio base debe ser un entero en pesos.")
    .min(0, "El precio base no puede ser negativo.")
    .max(COP_AMOUNT_MAX, "El precio base es demasiado alto."),
});

/**
 * Cambia el precio base. El precio de cada variante es base_price + price_delta,
 * así que cambia en todas; los pedidos y reservas ya creados guardan su propio
 * precio (unit_price/total_price) y no cambian. El techo de Crisálidas avisa,
 * no bloquea.
 */
export async function updateProductBasePrice(productId: string, basePrice: number): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  const parsed = updateBasePriceSchema.safeParse({ productId, basePrice });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const loaded = await loadProduct(parsed.data.productId);
  if (!loaded.ok) return { error: loaded.error };

  const { error } = await createAdminClient()
    .from("products")
    .update({ base_price: parsed.data.basePrice })
    .eq("id", parsed.data.productId);
  if (error) return { error: postgrestErrorMessage(error) };

  revalidateProduct(loaded.product.sku);
  return {
    error: null,
    warning: priceCeilingWarning(loaded.product.brand, loaded.product.category, parsed.data.basePrice),
  };
}

/**
 * Renombra el producto. El SKU no cambia (pedidos, insumos, variantes y n8n
 * dependen de él; el slug de la tienda sale del SKU). El nombre corto solo se
 * guarda si el nombre pasa de 20; si no, queda NULL (get_product lo ignora).
 */
export async function updateProductName(productId: string, name: string, shortName: string | null): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  if (!productIdSchema.safeParse(productId).success) return { error: "Producto inválido." };

  const parsed = parseProductName(name, shortName);
  if (!parsed.ok) return { error: parsed.error };

  const loaded = await loadProduct(productId);
  if (!loaded.ok) return { error: loaded.error };

  const { error } = await createAdminClient()
    .from("products")
    .update({ name: parsed.data.name, short_name: parsed.data.shortName })
    .eq("id", productId);
  if (error) return { error: postgrestErrorMessage(error) };

  revalidateProduct(loaded.product.sku);
  return { error: null };
}

/**
 * Elimina un producto sin historial de pedidos (delete_product, 050). La base
 * decide y se niega con PRODUCTO_CON_HISTORIAL; aquí solo se
 * borran después las fotos que devuelve. Un fallo de storage no deshace nada.
 */
export async function deleteProduct(productId: string): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  if (!productIdSchema.safeParse(productId).success) return { error: "Producto inválido." };

  const { data, error } = await createAdminClient().rpc("delete_product", { p_product: productId });
  const result = data as (RpcResult & { sku?: string; name?: string; image_urls?: string[] }) | null;
  if (error || !result?.ok) {
    return { error: `No se pudo eliminar el producto: ${rpcErrorMessage(result?.error, result?.mensaje ?? error?.message)}` };
  }

  await removeStoredImages(result.image_urls ?? []);

  revalidateProduct(null);
  redirect(`/admin/productos?eliminado=${encodeURIComponent(result.name ?? result.sku ?? "")}`);
}

/**
 * Elimina una variante sin historial (delete_variant, 051). La base se niega
 * con VARIANTE_CON_HISTORIAL o ULTIMA_VARIANTE; aquí solo se
 * borran después las fotos que devuelve (un fallo de storage solo se registra).
 */
export async function deleteVariant(
  variantId: string,
): Promise<{ ok: true; sku: string } | { ok: false; error: string }> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!z.string().uuid().safeParse(variantId).success) return { ok: false, error: "Variante inválida." };

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("delete_variant", { p_variant: variantId });
  const result = data as
    | (RpcResult & { sku?: string; product_id?: string; image_urls?: string[] })
    | null;
  if (error || !result?.ok || !result.sku) {
    return { ok: false, error: rpcErrorMessage(result?.error, result?.mensaje ?? error?.message) };
  }

  await removeStoredImages(result.image_urls ?? []);

  // El SKU del producto para revalidar su ficha: la variante ya no existe.
  const { data: product } = await supabase
    .from("products")
    .select("sku")
    .eq("id", result.product_id ?? "")
    .maybeSingle();
  revalidateProduct((product?.sku as string | undefined) ?? null);
  return { ok: true, sku: result.sku };
}

/**
 * Renombra una variante: un atributo, { key: value } (el nombre que ve el
 * cliente en WhatsApp). El trigger product_variants_enforce_names decide lo
 * demás (máx. 20, sin duplicados, sin variantes activas sin nombre) y sus
 * errores P0001 se traducen con postgrestErrorMessage.
 */
export async function updateVariantAttributes(variantId: string, key: string, value: string): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  if (!z.string().uuid().safeParse(variantId).success) return { error: "Variante inválida." };

  const supabase = createAdminClient();
  const { data, error: readError } = await supabase
    .from("product_variants")
    .select("attributes, products(sku)")
    .eq("id", variantId)
    .maybeSingle();
  if (readError) return { error: "No se pudo leer la variante. Inténtalo de nuevo." };
  if (!data) return { error: rpcErrorMessage("VARIANTE_NO_EXISTE") };

  const parsed = parseVariantAttributes(key, value, data.attributes as Record<string, unknown> | null);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("product_variants")
    .update({ attributes: parsed.attributes })
    .eq("id", variantId);
  if (error) return { error: postgrestErrorMessage(error) };

  const product = (data.products ?? null) as unknown as { sku: string } | null;
  revalidateProduct(product?.sku ?? null);
  return { error: null };
}

export async function setVariantActive(
  variantId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
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
  // Solo cuando la única variante activa no tiene nombre y hay que nombrarla.
  unnamedAttributeKey: z.string().trim().optional(),
  unnamedAttributeValue: z.string().trim().optional(),
  // Solo Crisálidas; la marca se lee de la base.
  chrysalisCount: z.string().optional(),
  // Initial stock; empty = 0 (parseVariantStock).
  stockQty: z.string().optional(),
});

const CHRYSALIS_NOT_SAVED = "No se guardó el número de crisálidas; edítalo en la variante.";
const PHOTO_NOT_SAVED = "No se pudo subir la foto; súbela desde la tarjeta de la variante.";

/**
 * Guarda chrysalis_count de una variante recién creada. Va después de la RPC
 * (que no lo recibe): si falla, la variante ya existe y solo se avisa.
 */
async function saveChrysalisCount(variantId: string, count: number | null): Promise<string | null> {
  if (count === null) return CHRYSALIS_NOT_SAVED;
  const { error } = await createAdminClient()
    .from("product_variants")
    .update({ chrysalis_count: count })
    .eq("id", variantId);
  return error ? CHRYSALIS_NOT_SAVED : null;
}

export async function createVariant(
  formData: FormData,
): Promise<{ ok: true; sku: string; warning: string | null } | { ok: false; error: string }> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
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

  // La foto es opcional; se valida antes de crear nada para no dejar una variante a medias.
  const photo = optionalImageFile(formData.get("photo"));
  if (photo) {
    const check = validateImageFile(photo);
    if (!check.ok) return { ok: false, error: check.error };
  }

  const supabase = createAdminClient();
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("brand")
    .eq("id", input.productId)
    .maybeSingle();
  if (productError) return { ok: false, error: "No se pudo leer el producto. Inténtalo de nuevo." };
  if (!product) return { ok: false, error: rpcErrorMessage("PRODUCTO_NO_EXISTE") };
  const chrysalis = parseChrysalisCount(product.brand as string, input.chrysalisCount);
  if (!chrysalis.ok) return { ok: false, error: chrysalis.error };
  const stock = parseVariantStock(input.stockQty);
  if (!stock.ok) return { ok: false, error: stock.error };

  const { data, error } = await supabase.rpc("create_variant_with_stock", {
    p_product: input.productId,
    p_attributes: attributes,
    p_stock_qty: stock.value,
    p_unnamed_variant_attributes: unnamed,
  });
  const result = data as (RpcResult & { sku?: string; variant_id?: string }) | null;
  if (error || !result?.ok || !result.sku || !result.variant_id) {
    return { ok: false, error: rpcErrorMessage(result?.error, result?.mensaje ?? error?.message) };
  }

  // Crisálidas y foto van después de la RPC (no los recibe): NO es atómico.
  // Si fallan, la variante ya existe y solo se avisa.
  const chrysalisWarning =
    product.brand === "crisalidas" ? await saveChrysalisCount(result.variant_id, chrysalis.value) : null;
  let photoWarning: string | null = null;
  if (photo) {
    const stored = await storeImage({ table: "product_variants", folder: "variants", id: result.variant_id }, photo);
    if (!stored.ok) photoWarning = PHOTO_NOT_SAVED;
  }
  const warning = combineWarnings(chrysalisWarning, photoWarning);

  revalidatePath("/admin/productos");
  revalidatePath("/admin/produccion");
  return { ok: true, sku: result.sku, warning };
}

/**
 * Edita chrysalis_count de una variante de Crisálidas. La marca sale del
 * producto de la variante en la base; otras marcas no llevan crisálidas.
 * Producción lo lee en vivo (/admin/produccion).
 */
export async function updateVariantStock(variantId: string, stockQty: number): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  if (!z.string().uuid().safeParse(variantId).success) return { error: "Variante inválida." };

  const parsed = parseVariantStock(stockQty);
  if (!parsed.ok) return { error: parsed.error };

  // There is no RPC for variant stock: the admin client writes the base stock directly.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update({ stock_qty: parsed.value })
    .eq("id", variantId)
    .select("id, products(sku)")
    .maybeSingle();
  if (error) return { error: postgrestErrorMessage(error) };
  if (!data) return { error: rpcErrorMessage("VARIANTE_NO_EXISTE") };

  const product = (data.products ?? null) as unknown as { sku: string } | null;
  revalidateProduct(product?.sku ?? null);
  return { error: null };
}

export async function updateVariantChrysalisCount(variantId: string, count: number | null): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  if (!z.string().uuid().safeParse(variantId).success) return { error: "Variante inválida." };

  const supabase = createAdminClient();
  const { data, error: readError } = await supabase
    .from("product_variants")
    .select("id, products(sku, brand)")
    .eq("id", variantId)
    .maybeSingle();
  if (readError) return { error: "No se pudo leer la variante. Inténtalo de nuevo." };
  const product = (data?.products ?? null) as unknown as { sku: string; brand: string } | null;
  if (!data || !product) return { error: rpcErrorMessage("VARIANTE_NO_EXISTE") };
  if (product.brand !== "crisalidas") return { error: "Solo los productos de Crisálidas llevan crisálidas." };

  const parsed = parseChrysalisCount(product.brand, count);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("product_variants")
    .update({ chrysalis_count: parsed.value })
    .eq("id", variantId);
  if (error) return { error: postgrestErrorMessage(error) };

  revalidatePath(`/admin/productos/${product.sku}`);
  revalidatePath("/admin/productos");
  revalidatePath("/admin/produccion");
  return { error: null };
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
