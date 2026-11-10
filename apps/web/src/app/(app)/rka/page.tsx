import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { editorMasters, loadScopedLines, openVersion } from "@/lib/rka";
import { activeYear } from "@/lib/fiscal-year";
import { BudgetGrid } from "@/components/erp/budget-grid";
import { displayUnit } from "@/lib/display-unit";
import { activeView, hiddenColumns, viewLines } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { BudgetEditor, type EditorLine } from "@/components/erp/budget-editor";
import { HeadcountPlan, type PlanPosition } from "@/components/erp/headcount-plan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteLine, saveHeadcount, saveLine, submitLines } from "./actions";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { rkaLabel } from "@estrada/domain";

/** The workbook budgets new hires on Beban rekrutmen, owned by HCM. */
const HEADCOUNT_COA = "6221";

export const metadata: Metadata = { title: "RKA Saya" };

export default async function RkaPage() {
  const user = await requireUser();
  const [version, lines, unit, year, view] = await Promise.all([openVersion(), loadScopedLines(user), displayUnit(), activeYear(), activeView()]);
  const prior = (version?.fiscalYear ?? year ?? new Date().getFullYear()) - 1;

  const isRequestor = user.actor.role === "requestor";
  const drafts = isRequestor ? lines.filter((l) => l.state === "draft" && l.canEdit) : [];
  // The editor keeps every draft so nothing is hidden while editing; the header narrows the read-only list.
  const others = await viewLines(lines.filter((l) => !drafts.includes(l)));
  const masters = isRequestor && version ? await editorMasters(user) : null;

  const editorLines: EditorLine[] = drafts.map((l) => ({
    id: l.id,
    coaCode: l.coaCode,
    entityCode: l.entity,
    ownerUnit: l.ownerUnit,
    item: l.item ?? "",
    basis: l.basis ?? "",
    months: l.months.map((m) => m.toFixed()),
    ...(l.remark ? { remark: l.remark } : {}),
    ...(l.priorRka ? { priorRka: l.priorRka.toFixed() } : {}),
    ...(l.priorActual ? { priorActual: l.priorActual.toFixed() } : {}),
    ...(l.flags?.length ? { flags: l.flags } : {}),
    commentCount: l.commentCount,
    ...(l.headcount ? { planned: true } : {}),
  }));
  const positions: PlanPosition[] = drafts.flatMap((l) =>
    l.headcount
      ? [{ id: l.id, position: l.headcount.position, entityCode: l.entity, coaCode: l.coaCode, count: l.headcount.count, startMonth: l.headcount.startMonth, costPerHead: l.headcount.costPerHead }]
      : [],
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">RKA Saya</h1>
        <p className="text-muted-foreground text-sm">{version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"}</p>
        <ViewNote />
      </div>

      {masters ? (
        <Card>
          <CardHeader>
            <CardTitle>Draft usulan</CardTitle>
            <CardDescription>
              Isi nominal dalam Rupiah. Tempel blok dari Excel langsung ke sel bulan, atau isi satu bulan lalu tekan “Isi ke kanan”.
              Perubahan disimpan sekaligus lewat tombol Simpan di bawah; centang baris yang sudah siap, lalu kirim ke Default Owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetEditor
              priorYear={prior}
              lines={editorLines}
              masters={masters}
              defaultEntity={view.entity && masters.entities.includes(view.entity) ? view.entity : (masters.entities[0] ?? "ESTRADA")}
              onSave={saveLine}
              onDelete={deleteLine}
              onSubmit={submitLines}
            />
          </CardContent>
        </Card>
      ) : null}

      {masters ? (
        <Card>
          <CardHeader>
            <CardTitle>Rencana headcount</CardTitle>
            <CardDescription>
              Satu baris per posisi baru. Nominal tiap bulan dihitung dari jumlah orang × biaya per orang mulai bulan masuk, lalu muncul di draft
              di atas untuk dikirim bersama baris lain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HeadcountPlan
              positions={positions}
              masters={{ coa: masters.coa.filter((c) => c.category === "OPEX" || c.category === "COGS"), entities: masters.entities }}
              defaultCoa={masters.coa.some((c) => c.code === HEADCOUNT_COA) ? HEADCOUNT_COA : (masters.coa[0]?.code ?? "")}
              defaultEntity={view.entity && masters.entities.includes(view.entity) ? view.entity : (masters.entities[0] ?? "ESTRADA")}
              onSave={saveHeadcount}
              onDelete={deleteLine}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <CardTitle>{isRequestor ? "Sudah dikirim" : "Baris anggaran"}</CardTitle>
              <CardDescription>Total dihitung otomatis dari Jan–Des.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {others.length ? (
            <BudgetGrid lines={others} priorYear={prior} unit={unit} hide={await hiddenColumns(others)} />
          ) : (
            <EmptyState icon={FileText} title="Belum ada baris anggaran di tahap ini." description="Baris yang sudah Anda kirim tampil di sini beserta tahapnya." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
