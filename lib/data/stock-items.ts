import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";

/**
 * Data layer for insumos (`stock_items`) in the panel. Insumos are a standalone
 * inventory: they have no relation to products, variants or options, so the
 * stock is read straight from `stock_items.stock_qty`.
 */

export interface StockItemRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  origin: "workshop" | "purchased";
  unit: string;
  stockQty: number;
  isActive: boolean;
  isDemo: boolean;
  imageUrl: string | null;
}

export interface StockMovement {
  id: string;
  delta: number;
  stockAfter: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  orderId: string | null;
}

interface RawItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  origin: "workshop" | "purchased";
  unit: string;
  stock_qty: number;
  is_active: boolean;
  image_url: string | null;
}

function toRow(item: RawItem): StockItemRow {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    origin: item.origin,
    unit: item.unit,
    stockQty: item.stock_qty,
    isActive: item.is_active,
    isDemo: item.sku.startsWith("DEMO-"),
    imageUrl: item.image_url,
  };
}

const ITEM_COLUMNS = "id, sku, name, description, origin, unit, stock_qty, is_active, image_url";

/** All insumos, ordered by SKU. */
export async function getStockItems(): Promise<StockItemRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("stock_items").select(ITEM_COLUMNS).order("sku");
  if (error) throw error;
  return (data as RawItem[]).map(toRow);
}

/** Últimos `perItem` movimientos de cada insumo (mapa insumo -> movimientos, más reciente primero). */
export async function getRecentMovementsByItem(perItem = 3): Promise<Map<string, StockMovement[]>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, stock_item_id, delta, stock_after, reason, created_by, created_at, order_id")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const byItem = new Map<string, StockMovement[]>();
  for (const m of data as {
    id: string;
    stock_item_id: string;
    delta: number;
    stock_after: number;
    reason: string;
    created_by: string | null;
    created_at: string;
    order_id: string | null;
  }[]) {
    const list = byItem.get(m.stock_item_id) ?? [];
    if (list.length >= perItem) continue;
    list.push({
      id: m.id,
      delta: m.delta,
      stockAfter: m.stock_after,
      reason: m.reason,
      createdBy: m.created_by,
      createdAt: m.created_at,
      orderId: m.order_id,
    });
    byItem.set(m.stock_item_id, list);
  }
  return byItem;
}

export async function getStockItemBySku(sku: string): Promise<{
  item: StockItemRow;
  movements: StockMovement[];
} | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select(ITEM_COLUMNS)
    .eq("sku", sku)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const raw = data as RawItem;

  const movRes = await supabase
    .from("stock_movements")
    .select("id, delta, stock_after, reason, created_by, created_at, order_id")
    .eq("stock_item_id", raw.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (movRes.error) throw movRes.error;

  return {
    item: toRow(raw),
    movements: (
      movRes.data as {
        id: string;
        delta: number;
        stock_after: number;
        reason: string;
        created_by: string | null;
        created_at: string;
        order_id: string | null;
      }[]
    ).map((m) => ({
      id: m.id,
      delta: m.delta,
      stockAfter: m.stock_after,
      reason: m.reason,
      createdBy: m.created_by,
      createdAt: m.created_at,
      orderId: m.order_id,
    })),
  };
}
