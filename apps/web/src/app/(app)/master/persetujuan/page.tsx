import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { CATEGORY_LABEL, OPEN_CHANGE_STATUSES, formatIdr, money, type Category } from "@estrada/domain";
import { masterAccess } from "@/lib/master";
import { subjectLabel } from "@/lib/master-change";
import { requireUser } from "@/lib/session";
import { ChangeRequests } from "@/components/erp/change-requests";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { cancelRequest, decideRequest } from "./actions";

export const metadata: Metadata = { title: "Persetujuan Master" };

const FIELD: Record<string, string> = {
  name: "Nama",
  category: "Kategori",
  center: "Pusat",
  defaultOwnerUnit: "Default owner",
  parentCode: "Induk",
  active: "Aktif",
  guidance: "Panduan pengisian",
  costType: "Jenis biaya",
  target: "Pindahkan baris ke",
  npwp: "NPWP",
  nib: "NIB",
  address: "Alamat",
  domicile: "Kedudukan",
  phone: "Telepon",
  email: "Email",
  director: "Direktur",
  commissioner: "Komisaris",
  authorisedCapital: "Modal dasar",
};
const ACTION: Record<string, string> = { create: "Tambah", update: "Ubah", confirm: "Konfirmasi kode sementara", remap: "Pindahkan baris" };
const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const shown = (field: string, value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : field === "authorisedCapital" ? formatIdr(money(String(value))) : typeof value === "boolean" ? (value ? "Ya" : "Tidak") : field === "category" ? CATEGORY_LABEL[value as Category] : String(value);

export default async function ApprovalPage() {
  const user = await requireUser();
  const { may, employees, requests, costCenters, periods } = await masterAccess();
  if (!requests) redirect("/master/customer");
  const [rows, users] = await Promise.all([
    db.select().from(schema.masterChangeRequest).orderBy(desc(schema.masterChangeRequest.requestedAt)).limit(100),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));

  return (
    <MasterWorkspace active="/master/persetujuan" periods={periods} costCenters={costCenters} employees={employees} requests steward="Perubahan COA dan Perusahaan diterapkan setelah disetujui Finance Controller (Division Owner FRM). Pemohon tidak memutuskan permintaannya sendiri.">
      <ChangeRequests
        rows={rows.map((r) => {
          const before = r.before ?? {};
          const changes = Object.entries(r.payload)
            .filter(([k, v]) => k !== "center" && (!r.before || r.action === "remap" || before[k] !== v))
            .map(([k, v]) => ({ field: FIELD[k] ?? k, before: r.before && r.action !== "remap" ? shown(k, before[k]) : null, after: shown(k, v) }));
          return {
            id: r.id,
            title: `${subjectLabel(r)} · ${ACTION[r.action] ?? r.action}`,
            changes,
            reason: r.reason,
            effectiveOn: day.format(new Date(r.effectiveOn)),
            requester: name.get(r.requesterId) ?? r.requesterId,
            status: r.status,
            note: r.note,
            canDecide: r.status === "pending" && r.requesterId !== user.id && may("master.approve"),
            canCancel: OPEN_CHANGE_STATUSES.includes(r.status) && r.requesterId === user.id,
          };
        })}
        onDecide={decideRequest}
        onCancel={cancelRequest}
      />
    </MasterWorkspace>
  );
}
