import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { PARTNER_CATEGORIES, partnerIssues } from "@estrada/domain";
import { formValues, masterAccess } from "@/lib/master";
import { MasterTable, type MasterField } from "@/components/erp/master-table";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { savePartner } from "../actions";

export const metadata: Metadata = { title: "Master Mitra" };

const FIELDS: MasterField[] = [
  { name: "name", label: "Nama mitra", column: true, required: true, wide: true },
  { name: "category", label: "Kategori", column: true, type: "select", options: PARTNER_CATEGORIES.map((value) => ({ value })) },
  { name: "npwp", label: "NPWP", column: true },
  { name: "city", label: "Kota", column: true },
  { name: "email", label: "Email" },
  { name: "phone", label: "Telepon" },
  { name: "address", label: "Alamat", wide: true },
  { name: "picName", label: "Nama PIC" },
  { name: "picTitle", label: "Jabatan PIC" },
  { name: "picPhone", label: "Telepon PIC" },
  { name: "picEmail", label: "Email PIC" },
];

export default async function PartnerMasterPage() {
  const { may, employees } = await masterAccess();
  const partners = await db.select().from(schema.partner).orderBy(asc(schema.partner.id));
  const issues = Map.groupBy(partnerIssues(partners), (i) => i.id);
  const names = FIELDS.map((f) => f.name);

  return (
    <MasterWorkspace active="/master/mitra" employees={employees} steward="Master Mitra dikelola SCM. Peran lain hanya membaca.">
      <MasterTable
        noun="mitra"
        fields={FIELDS}
        rows={partners.map((p) => ({ id: p.id, values: formValues(p, names), issues: (issues.get(p.id) ?? []).map((i) => i.message) }))}
        onSave={may("partner.manage") ? savePartner : undefined}
      />
    </MasterWorkspace>
  );
}
