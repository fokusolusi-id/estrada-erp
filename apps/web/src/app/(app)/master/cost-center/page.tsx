import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { FUNCTION_GROUPS, formatIdr, money } from "@estrada/domain";
import { formValues, masterAccess } from "@/lib/master";
import { MasterTable, type MasterField } from "@/components/erp/master-table";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { saveCostCenter } from "../actions";

export const metadata: Metadata = { title: "Master Cost Center" };

const FIELDS: MasterField[] = [
  { name: "name", label: "Unit", column: true, readOnly: true },
  { name: "functionGroup", label: "Function group", column: true, type: "select", options: [{ value: "", label: "—" }, ...FUNCTION_GROUPS.map((value) => ({ value }))] },
  { name: "approvalLimit", label: "Limit persetujuan (Rp)", column: true },
  { name: "aliases", label: "Nama lain", column: true, readOnly: true },
];

export default async function CostCenterPage() {
  const { may, employees, requests, costCenters, periods } = await masterAccess();
  if (!costCenters) redirect("/master/customer");
  const units = await db.select().from(schema.orgUnit).orderBy(asc(schema.orgUnit.code));
  const names = FIELDS.map((f) => f.name);

  return (
    <MasterWorkspace active="/master/cost-center" periods={periods} employees={employees} requests={requests} costCenters steward="Cost center adalah unit organisasi. Finance mengatur limit persetujuan dan function group-nya.">
      <MasterTable
        noun="cost center"
        fields={FIELDS}
        rows={units.map((u) => ({
          id: u.code,
          values: formValues({ ...u, aliases: u.aliases.join(", "), approvalLimit: u.approvalLimit ? formatIdr(money(u.approvalLimit)).replace("Rp ", "") : "" }, names),
          issues: [],
        }))}
        onSave={may("costcenter.manage") ? saveCostCenter : undefined}
        fixed
      />
    </MasterWorkspace>
  );
}
