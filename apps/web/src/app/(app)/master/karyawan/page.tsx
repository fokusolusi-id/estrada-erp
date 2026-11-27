import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { formValues, masterAccess } from "@/lib/master";
import { MasterTable, type MasterField } from "@/components/erp/master-table";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { saveEmployee } from "../actions";

export const metadata: Metadata = { title: "Master Karyawan" };

export default async function EmployeeMasterPage() {
  const { may, employees, requests, costCenters, periods } = await masterAccess();
  if (!employees) redirect("/master/customer");
  const [people, entities, units] = await Promise.all([
    db.select().from(schema.employee).orderBy(asc(schema.employee.name)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
  ]);
  const fields: MasterField[] = [
    { name: "name", label: "Nama", column: true, required: true, wide: true },
    { name: "nip", label: "NIP", required: true, createOnly: true },
    { name: "email", label: "Email", column: true },
    { name: "entityCode", label: "PT", column: true, type: "select", options: entities.map((e) => ({ value: e.code })) },
    { name: "unitCode", label: "Unit", column: true, type: "select", options: [{ value: "", label: "—" }, ...units.map((u) => ({ value: u.code, label: `${u.code} · ${u.name}` }))] },
    { name: "position", label: "Posisi", required: true, suggestions: [...new Set(people.map((e) => e.position))] },
    { name: "title", label: "Jabatan", column: true, required: true },
    { name: "functionCodes", label: "Fungsi", column: true },
    { name: "employmentStatus", label: "Status kerja", column: true, required: true, suggestions: [...new Set(people.map((e) => e.employmentStatus))] },
    { name: "joinedOn", label: "Tanggal masuk (YYYY-MM-DD)" },
    { name: "managerNip", label: "NIP atasan" },
    { name: "phone", label: "Telepon" },
    { name: "notes", label: "Catatan", wide: true },
    { name: "account", label: "Akun aplikasi", column: true, readOnly: true },
  ];
  const names = fields.map((f) => f.name);

  return (
    <MasterWorkspace active="/master/karyawan" periods={periods} costCenters={costCenters} employees requests={requests} steward="Master Karyawan dikelola HCM. Akun masuk aplikasi diundang di menu Pengguna dan terhubung lewat email yang sama.">
      <MasterTable
        noun="karyawan"
        fields={fields}
        rows={people.map((e) => ({
          id: e.nip,
          values: formValues({ ...e, functionCodes: e.functionCodes.join(", "), account: e.userId ? "Ada" : "Belum" }, names),
          issues: [],
        }))}
        onSave={may("employee.manage") ? saveEmployee : undefined}
      />
    </MasterWorkspace>
  );
}
