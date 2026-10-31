import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contribution, pnl, type ApprovalState, type Role } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadScopedLines, reportVersions } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { ContributionTable } from "@/components/erp/contribution-table";
import { KpiCard } from "@/components/erp/kpi-card";
import { PnlTable } from "@/components/erp/pnl-table";
import { ScopeBar } from "@/components/erp/scope-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Management Summary" };

const ROLES: readonly Role[] = ["division_owner", "finance", "director", "auditor"];
const STATUS: Record<string, { label: string; states: readonly ApprovalState[] | null }> = {
  all: { label: "Semua status", states: null },
  final: { label: "Sudah difinalisasi", states: ["awaiting_lock", "locked"] },
  locked: { label: "Terkunci", states: ["locked"] },
};

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; entity?: string; division?: string; status?: string }>;
}) {
  const user = await requireUser();
  if (!ROLES.includes(user.actor.role)) notFound();
  const params = await searchParams;
  const status = STATUS[params.status ?? "all"] ?? STATUS.all!;

  // The open version, else the latest locked one: the final RKA must stay readable after the lock.
  const versions = await reportVersions();
  const version = versions.find((v) => v.id === params.version) ?? versions[0] ?? null;
  const [scoped, org] = await Promise.all([version ? loadScopedLines(user, undefined, version.id) : [], loadOrg()]);
  const entities = [...new Set(scoped.map((l) => l.entity))].sort();
  const divisions = [...new Set(scoped.map((l) => org.divisionOf(l.ownerUnit)))].sort();

  const lines = scoped.filter(
    (l) =>
      (!params.entity || l.entity === params.entity) &&
      (!params.division || org.divisionOf(l.ownerUnit) === params.division) &&
      (!status.states || status.states.includes(l.state)),
  );
  const rows = pnl(lines);
  const total = (key: string) => rows.find((r) => r.key === key)!.total;
  const locked = lines.filter((l) => l.state === "locked").length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Management Summary</h1>
          <p className="text-muted-foreground text-sm">
            {version ? version.name : "Belum ada siklus RKA yang dibuka"} · Rp juta · {lines.length} baris, {locked} terkunci
          </p>
        </div>
        <ScopeBar
          filters={[
            ...(versions.length > 1
              ? [{ name: "version", label: "Versi", options: versions.map((v) => ({ value: v.id, label: `${v.name}${v.status === "locked" ? " (terkunci)" : ""}` })) }]
              : []),
            { name: "entity", label: "Entitas", options: [{ value: "", label: "Semua entitas" }, ...entities.map((e) => ({ value: e, label: e }))] },
            { name: "division", label: "Divisi", options: [{ value: "", label: "Semua divisi" }, ...divisions.map((d) => ({ value: d, label: d }))] },
            { name: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pendapatan" value={total("Revenue")} note="Rencana invoice" />
        <KpiCard label="Total Biaya" value={total("TotalCost")} note="COGS + OPEX + OTHERS + CAPEX" />
        <KpiCard label="Laba Sebelum Pajak" value={total("ProfitBeforeTax")} />
        <KpiCard label="CAPEX" value={total("CAPEX")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan per bulan</CardTitle>
          <CardDescription>Semua angka dihitung dari baris RKA yang sama, jadi Rekap dan Kontribusi Divisi selalu sama.</CardDescription>
        </CardHeader>
        <CardContent>
          <PnlTable rows={rows} unit="juta" />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kontribusi Divisi</CardTitle>
            <CardDescription>Per divisi pengusul, seperti sheet Kontribusi Divisi dan Rekap.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionTable rows={contribution(lines, (l) => org.divisionOf(l.requestorUnit))} unit="juta" label="Divisi pengusul" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Per entitas</CardTitle>
            <CardDescription>Entitas dengan pendapatan tanpa biaya perlu aturan alokasi biaya bersama.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContributionTable rows={contribution(lines, (l) => l.entity)} unit="juta" label="Entitas" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
