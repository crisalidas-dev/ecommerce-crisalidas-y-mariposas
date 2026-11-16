"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clearImage, storeImage } from "@/lib/admin/imageStorage";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { requireProductEditor } from "@/lib/admin/productGuard";
import { optionalImageFile, validateImageFile } from "@/lib/domain/imageUpload";
import { mapCreateStockItemResult, parseCreateStockItemInput } from "@/lib/domain/stockItemCreate";
import { rpcErrorMessage } from "@/lib/domain/stockErrors";

export type FormState = { error: string | null; saved?: boolean };

type RpcResult = { ok: boolean; error?: string; mensaje?: string; [key: string]: unknown };

async function callRpc(fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: "RPC", mensaje: error.message };
  return (data ?? { ok: false }) as RpcResult;
}

function failure(res: RpcResult): { ok: false; error: string } {
  return { ok: false, error: rpcErrorMessage(res.error, res.mensaje) };
}

const updateFieldsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  description: z.string().trim().optional(),
  unit: z.string().trim().min(1, "La unidad es obligatoria.").max(20),
});

export async function createStockItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  const parsed = parseCreateStockItemInput(Object.fromEntries(formData));
  if (!parsed.ok) return { error: parsed.error };
  const input = parsed.data;

  // La foto es opcional; se valida antes de crear para no dejar un insumo a medias.
  const photo = optionalImageFile(formData.get("photo"));
  if (photo) {
    const check = validateImageFile(photo);
    if (!check.ok) return { error: check.error };
  }

  // El SKU lo asigna la base de datos (secuencia por origen / sufijo de variante).
  const res = mapCreateStockItemResult(
    await callRpc("create_stock_item", {
      p_origin: input.origin,
      p_name: input.name,
      p_description: input.description,
      p_unit: input.unit,
      p_variant_of: input.variantOf,
    }),
  );
  if (!res.ok) return { error: res.error };

  // Si la foto falla, el insumo ya existe: no se revierte y la ficha avisa con `?foto=error`.
  let photoFailed = false;
  if (photo) {
    const stored = await storeImage({ table: "stock_items", folder: "stock-items", id: res.stockItemId }, photo);
    photoFailed = !stored.ok;
  }
  revalidatePath("/admin/productos/insumos");
  redirect(`/admin/productos/insumos/${encodeURIComponent(res.sku)}${photoFailed ? "?foto=error" : ""}`);
}

export async function updateStockItem(
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { error: guard.error };
  const parsed = updateFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const input = parsed.data;

  // El SKU y el origen son inmutables: nunca van en el payload de actualización.
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stock_items")
    .update({
      name: input.name,
      description: input.description || null,
      unit: input.unit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  revalidatePath("/admin/productos/insumos");
  return { error: null, saved: true };
}

export async function setStockItemActive(itemId: string, sku: string, active: boolean) {
  const guard = await requireProductEditor();
  if (!guard.ok) throw new Error(guard.error);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("stock_items")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw error;
  revalidatePath("/admin/productos/insumos");
  revalidatePath(`/admin/productos/insumos/${sku}`);
}

const adjustSchema = z.object({
  itemId: z.string().uuid(),
  mode: z.enum(["delta", "set"]),
  qty: z.coerce.number().int(),
  reason: z.string().trim().min(1, "Indica el motivo del ajuste."),
});

export type AdjustResult =
  | { ok: true; stockQty: number }
  | { ok: false; error: string };

export async function adjustStockItem(input: {
  itemId: string;
  mode: "delta" | "set";
  qty: number;
  reason: string;
}): Promise<AdjustResult> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const res = await callRpc("adjust_stock_item", {
    p_item: parsed.data.itemId,
    p_mode: parsed.data.mode,
    p_qty: parsed.data.qty,
    p_reason: parsed.data.reason,
    p_actor: guard.actor,
  });
  if (!res.ok) return failure(res);

  revalidatePath("/admin/productos", "layout");
  return { ok: true, stockQty: Number(res.stock_qty) };
}

export type DeleteResult =
  | { ok: true; deleted: true }
  | { ok: true; deleted: false; archived: true; message: string }
  | { ok: false; error: string };

export async function deleteStockItem(itemId: string): Promise<DeleteResult> {
  const guard = await requireProductEditor();
  if (!guard.ok) return { ok: false, error: guard.error };
  const res = await callRpc("delete_stock_item", { p_item: itemId });
  if (!res.ok) return failure(res);
  revalidatePath("/admin/productos", "layout");
  if (res.deleted) return { ok: true, deleted: true };
  return {
    ok: true,
    deleted: false,
    archived: true,
    message: "El insumo tiene historial de movimientos: se archivó en vez de borrarse.",
  };
}

export async function uploadStockItemImage(
  itemId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const res = await storeImage({ table: "stock_items", folder: "stock-items", id: itemId }, formData.get("file"));
  if (!res.ok) return res;
  revalidatePath("/admin/productos/insumos");
  revalidatePath(`/admin/productos/insumos/${res.sku}`);
  return { ok: true, url: res.url };
}

export async function removeStockItemImage(
  itemId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await clearImage({ table: "stock_items", folder: "stock-items", id: itemId });
  if (!res.ok) return res;
  revalidatePath("/admin/productos/insumos");
  revalidatePath(`/admin/productos/insumos/${res.sku}`);
  return { ok: true };
}
