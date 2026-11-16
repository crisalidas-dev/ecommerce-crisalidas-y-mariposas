import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";

/**
 * Capa de datos del panel para `products`/`product_variants`. Distinta de
 * `lib/data/storefront-products.ts` (catálogo público, solo columnas públicas).
 */

export interface VariantRow {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  price_delta: number;
  is_active: boolean;
  image_url: string | null;
  /** Base stock the admin edits (`product_variants.stock_qty`). */
  stockQty: number;
  /** Sellable units: computed column `available_units` (stock minus live reservations). */
  availableUnits: number;
  /** Alguna reserva (en cualquier estado): tiene pedidos, no se puede eliminar (delete_variant, 051). */
  hasOrderHistory: boolean;
  /** Crisálidas por unidad. NULL = sin definir (producción no la suma); 0 = no lleva. */
  chrysalisCount: number | null;
}

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string | null;
  base_price: number;
  is_published: boolean;
  thumbnailUrl: string | null;
  availableUnits: number;
}

export interface ProductDetail {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string | null;
  description: string | null;
  base_price: number;
  is_published: boolean;
  simbolismo: string | null;
  short_name: string | null;
  /** Mayor número -VNN ya entregado (047): el siguiente SKU nunca reutiliza uno borrado. */
  lastVariantNumber: number;
  /** Alguna reserva (en cualquier estado) sobre sus variantes: hay pedidos, no se puede eliminar. */
  hasOrderHistory: boolean;
  variants: VariantRow[];
}

interface RawVariant {
  id: string;
  sku: string;
  attributes: Record<string, string> | null;
  price_delta: number | string;
  is_active: boolean;
  image_url: string | null;
  chrysalis_count: number | null;
  stock_qty: number | string | null;
  available_units: number | string | null;
}

export async function getProducts(filters: {
  brand?: string;
  published?: boolean;
}): Promise<ProductListItem[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from("products")
    .select(
      "id, sku, name, brand, category, base_price, is_published, product_variants(id, sku, image_url, is_active, available_units)",
    )
    .order("name");

  if (filters.brand) query = query.eq("brand", filters.brand);
  if (typeof filters.published === "boolean") query = query.eq("is_published", filters.published);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((p) => {
    const variants = (p.product_variants ?? []) as unknown as {
      id: string;
      image_url: string | null;
      is_active: boolean;
      available_units: number | string | null;
    }[];
    const activeVariants = variants.filter((v) => v.is_active);
    const thumbnailUrl = activeVariants.find((v) => v.image_url)?.image_url ?? null;
    const availableUnits = activeVariants.reduce(
      (sum, v) => sum + Number(v.available_units ?? 0),
      0,
    );

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      base_price: Number(p.base_price),
      is_published: p.is_published,
      thumbnailUrl,
      availableUnits,
    };
  });
}

export async function getProductBySku(sku: string): Promise<ProductDetail | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      "id, sku, name, brand, category, description, base_price, is_published, simbolismo, short_name, last_variant_number, product_variants(id, sku, attributes, price_delta, is_active, image_url, chrysalis_count, stock_qty, available_units)",
    )
    .eq("sku", sku)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const rawVariants = data.product_variants as unknown as RawVariant[];
  const variantIds = rawVariants.map((v) => v.id);

  // Las reservas enlazan los pedidos con las variantes (delete_product, 050).
  const historyRes = await supabase.from("reservations").select("variant_id").in("variant_id", variantIds);
  if (historyRes.error) throw historyRes.error;
  const variantsWithHistory = new Set((historyRes.data ?? []).map((r) => r.variant_id as string));

  return {
    id: data.id,
    sku: data.sku,
    name: data.name,
    brand: data.brand,
    category: data.category,
    description: data.description,
    base_price: Number(data.base_price),
    is_published: data.is_published,
    simbolismo: data.simbolismo,
    short_name: data.short_name,
    lastVariantNumber: Number(data.last_variant_number ?? 0),
    hasOrderHistory: variantsWithHistory.size > 0,
    variants: rawVariants.map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes ?? {},
      price_delta: Number(v.price_delta),
      is_active: v.is_active,
      image_url: v.image_url,
      stockQty: Number(v.stock_qty ?? 0),
      availableUnits: Number(v.available_units ?? 0),
      hasOrderHistory: variantsWithHistory.has(v.id),
      chrysalisCount: v.chrysalis_count ?? null,
    })),
  };
}
