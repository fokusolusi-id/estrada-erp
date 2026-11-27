import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { formValues, masterAccess } from "@/lib/master";
import { MasterTable, type MasterField } from "@/components/erp/master-table";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { saveProduct } from "../actions";

export const metadata: Metadata = { title: "Master Produk Mitra" };

export default async function ProductMasterPage() {
  const { may, employees } = await masterAccess();
  const [products, partners] = await Promise.all([
    db.select().from(schema.partnerProduct).orderBy(asc(schema.partnerProduct.id)),
    db.select({ id: schema.partner.id, name: schema.partner.name }).from(schema.partner).orderBy(asc(schema.partner.name)),
  ]);
  const fields: MasterField[] = [
    { name: "partnerId", label: "Mitra", column: true, type: "select", options: partners.map((p) => ({ value: p.id, label: `${p.name} (${p.id})` })), wide: true },
    { name: "category", label: "Kategori", column: true, required: true, suggestions: [...new Set(products.map((p) => p.category))] },
    { name: "type", label: "Jenis", column: true, required: true },
    { name: "brand", label: "Brand", column: true, required: true },
  ];
  const names = fields.map((f) => f.name);

  return (
    <MasterWorkspace active="/master/produk" employees={employees} steward="Master Produk Mitra dikelola SCM. Peran lain hanya membaca.">
      <MasterTable
        noun="produk"
        fields={fields}
        rows={products.map((p) => ({ id: p.id, values: formValues(p, names), issues: [] }))}
        onSave={may("partner.manage") ? saveProduct : undefined}
      />
    </MasterWorkspace>
  );
}
