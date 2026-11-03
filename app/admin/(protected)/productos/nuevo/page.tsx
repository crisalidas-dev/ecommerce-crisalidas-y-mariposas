import type { Metadata } from "next";
import { getActiveProductLines } from "@/lib/data/product-lines";
import { BackLink } from "../../ui/BackLink";
import { NewProductForm } from "./NewProductForm";

export const metadata: Metadata = { title: "Nuevo producto — Panel Nacer Group" };

export default async function NuevoProductoPage() {
  const lines = await getActiveProductLines();
  return (
    <div className="animate-view-in flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <BackLink href="/admin/productos">Productos</BackLink>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-admin-ink">Nuevo producto</h1>
          <p className="text-sm text-admin-ink-muted">
            El SKU lo genera el sistema a partir de la marca, la línea y el nombre.
          </p>
        </div>
      </div>
      <NewProductForm lines={lines} />
    </div>
  );
}
