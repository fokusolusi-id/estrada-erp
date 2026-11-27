import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { customerIssues } from "@estrada/domain";
import { formValues, groupCompanyField, masterAccess } from "@/lib/master";
import { MasterTable, type MasterField } from "@/components/erp/master-table";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { saveCustomer } from "../actions";

export const metadata: Metadata = { title: "Master Customer" };

/** Sheet ref. */
const SEGMENTS = ["Telco", "APH", "K/L", "Pemda"];

export default async function CustomerMasterPage() {
  const { may, employees, requests, costCenters, periods } = await masterAccess();
  const customers = await db.select().from(schema.customer).orderBy(asc(schema.customer.id));
  const issues = Map.groupBy(customerIssues(customers), (i) => i.id);
  const fields: MasterField[] = [
    { name: "legalName", label: "Nama customer", column: true, required: true, wide: true },
    { name: "nickname", label: "Nama panggilan", column: true, required: true },
    { name: "segment", label: "Segmen", column: true, required: true, suggestions: [...new Set([...SEGMENTS, ...customers.map((c) => c.segment)])] },
    { name: "subSegment", label: "Sub-segmen / direktorat" },
    { name: "npwp", label: "NPWP", column: true },
    { name: "paymentTermDays", label: "Term of payment (hari)" },
    { name: "wapu", label: "Wajib pungut (Wapu)", type: "checkbox" },
    { name: "email", label: "Email" },
    { name: "phone", label: "Telepon" },
    { name: "address", label: "Alamat", wide: true },
    { name: "picName", label: "Nama PIC" },
    { name: "picTitle", label: "Jabatan PIC" },
    { name: "picPhone", label: "Telepon PIC" },
    { name: "picEmail", label: "Email PIC" },
    await groupCompanyField(),
  ];
  const names = fields.map((f) => f.name);

  return (
    <MasterWorkspace active="/master/customer" periods={periods} costCenters={costCenters} employees={employees} requests={requests} steward="Master Customer dikelola Sales (BCD). Peran lain hanya membaca.">
      <MasterTable
        noun="customer"
        fields={fields}
        rows={customers.map((c) => ({ id: c.id, values: formValues(c, names), issues: (issues.get(c.id) ?? []).map((i) => i.message) }))}
        onSave={may("customer.manage") ? saveCustomer : undefined}
      />
    </MasterWorkspace>
  );
}
