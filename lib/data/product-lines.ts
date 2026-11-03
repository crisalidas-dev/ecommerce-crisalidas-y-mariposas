import "server-only";
import { createAdminClient } from "@/lib/supabase/admin-client";
import type { ProductLine } from "@/lib/domain/productLine";

/** Active product lines (second segment of the SKU), ordered by brand then name. */
export async function getActiveProductLines(): Promise<ProductLine[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("product_lines")
    .select("id, brand, code, name, is_active")
    .eq("is_active", true)
    .order("brand")
    .order("name");
  if (error) throw error;
  return data ?? [];
}
