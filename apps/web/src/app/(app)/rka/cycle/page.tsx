import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { count, desc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can, newYearProblem, reviseProblem, type ApprovalState } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { VersionTable, type VersionRow } from "@/components/erp/version-table";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DeadlineForm, OpenCycleForm, ReviseForm } from "./cycle-forms";
import { rkaLabel } from "@estrada/domain";

export const metadata: Metadata = { title: "Siklus RKA" };

const jakartaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

export default async function CyclePage({ searchParams }: { searchParams: Promise<{ done?: string; v?: string }> }) {
  const user = await requireUser();
  if (user.actor.role !== "finance" && user.actor.role !== "director") notFound();
  const manage = can(user.actor, "cycle.manage", null, await loadOrg());

  const [versions, counts] = await Promise.all([
    db.select().from(schema.budgetVersion).orderBy(desc(schema.budgetVersion.createdAt)),
    db
      .select({ versionId: schema.budgetLine.versionId, state: schema.budgetLine.state, n: count() })
      .from(schema.budgetLine)
      .groupBy(schema.budgetLine.versionId, schema.budgetLine.state),
  ]);
  const nameOf = new Map(versions.map((v) => [v.id, v.name]));
  const rows: VersionRow[] = versions.map((v) => ({
    id: v.id,
    name: v.name,
    fiscalYear: v.fiscalYear,
    status: v.status,
    deadline: v.submissionDeadline,
    copiedFrom: v.copiedFromId ? (nameOf.get(v.copiedFromId) ?? null) : null,
    byState: Object.fromEntries(counts.filter((c) => c.versionId === v.id).map((c) => [c.state, c.n])) as Partial<Record<ApprovalState, number>>,
  }));
  const { done, v: doneId } = await searchParams;
  const doneVersion = versions.find((v) => v.id === doneId);
  const notice =
    doneVersion && done === "revised"
      ? `${doneVersion.name} dibuka dari ${nameOf.get(doneVersion.copiedFromId ?? "") ?? "versi terkunci"}.`
      : doneVersion && done === "opened"
        ? `${doneVersion.name} dibuka; email dikirim ke semua requestor.`
        : null;
  // The year to open next: after the newest year once it is locked, or next calendar year before the first cycle.
  const live = versions.filter((v) => v.status !== "archived");
  const latest = live.length ? Math.max(...live.map((v) => v.fiscalYear)) : null;
  // A year still on its first version is unfinished; one whose open version is only a revision is done.
  const unfinished = live.some((v) => v.fiscalYear === latest && v.status === "open" && !v.copiedFromId);
  const nextYear = latest === null ? new Date().getFullYear() + 1 : unfinished ? latest : latest + 1;
  const openProblem = newYearProblem(nextYear, versions);
  const previous = versions
    .filter((v) => v.fiscalYear === nextYear - 1 && v.status === "locked")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Siklus RKA</h1>
        <p className="text-muted-foreground text-sm">
          Satu versi terbuka per tahun. Versi terkunci tidak pernah diubah; revisi menyalinnya menjadi versi baru.
        </p>
      </div>

      {notice ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Versi</CardTitle>
        </CardHeader>
        <CardContent>
          <VersionTable
            rows={rows}
            {...(manage
              ? {
                  actions: (r: VersionRow) =>
                    r.status === "open" ? (
                      <DeadlineForm versionId={r.id} current={r.deadline ? jakartaDate(r.deadline) : null} />
                    ) : r.status === "locked" && !reviseProblem(r, versions) ? (
                      <ReviseForm versionId={r.id} />
                    ) : null,
                }
              : {})}
          />
        </CardContent>
      </Card>

      {manage && openProblem === "other_year_open" ? (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          RKA {nextYear - 1} masih terbuka. Tahun berikutnya dapat dibuka setelah versi itu dikunci; revisi tahun yang terkunci tetap bisa dibuka kapan saja.
        </p>
      ) : null}
      {manage && !openProblem ? (
        <Card>
          <CardHeader>
            <CardTitle>Buka siklus baru</CardTitle>
            <CardDescription>
              Membuka tahun anggaran berikutnya, kosong atau mulai dari RKA tahun lalu yang terkunci, lalu mengirim email ke semua requestor dengan batas waktunya.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OpenCycleForm fiscalYear={nextYear} previous={previous ? rkaLabel(previous) : null} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
