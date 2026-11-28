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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteLine, saveHeadcount, saveLine, submitLines } from "./actions";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/erp/empty-state";
import { APPROVAL_STATES, ROLE_LABEL, filterByBoard, searchLines, paginate, requestedWithin, requestorOverview, rkaLabel, type Role } from "@estrada/domain";
import Link from "next/link";
import { STATE_LABEL } from "@/components/erp/status-badge";
import { Pager } from "@/components/erp/pager";
import { RequestorOverview } from "@/components/erp/requestor-overview";
import { approvalConfig, loadOrg } from "@/lib/workflow";

/** The workbook budgets new hires on Beban rekrutmen, owned by HCM. */
const HEADCOUNT_COA = "6221";

/** Finance reads every unit's lines here, so the screen is not "theirs". */
const titleFor = (role: Role) => (role === "finance" ? "Daftar Baris RKA" : "RKA Saya");

export async function generateMetadata(): Promise<Metadata> {
  return { title: titleFor((await requireUser()).actor.role) };
}

/** Rows per page of the read-only list; the Total row still adds up every row. */
const PAGE_SIZE = 50;

export default async function RkaPage({ searchParams }: { searchParams: Promise<{ hal?: string; divisi?: string; status?: string; q?: string }> }) {
  const { hal, divisi, status, q } = await searchParams;
  const user = await requireUser();
  const [version, scoped, unit, year, view, org] = await Promise.all([openVersion(), loadScopedLines(user), displayUnit(), activeYear(), activeView(), loadOrg()]);
  const prior = (version?.fiscalYear ?? year ?? new Date().getFullYear()) - 1;

  const isRequestor = user.actor.role === "requestor";
  // A requestor's RKA Saya is what its own unit asked for, within its entities; lines other units charge to it stay out.
  const lines = isRequestor ? scoped.filter(requestedWithin(user.actor.orgUnit, org)) : scoped;
  const overview = isRequestor && version ? requestorOverview(lines.map((l) => ({ state: l.state, returned: !!l.remark, commentCount: l.commentCount }))) : null;
  const drafts = isRequestor ? lines.filter((l) => l.state === "draft" && l.canEdit) : [];
  // The editor keeps every draft so nothing is hidden while editing; the header narrows the read-only list.
  const visible = await viewLines(lines.filter((l) => !drafts.includes(l)));
  // A status board count links here with the division and state it counted.
  const state = APPROVAL_STATES.find((s) => s === status);
  const others = searchLines(filterByBoard(visible, { division: divisi, state }, (u) => org.divisionOf(u)), q);
  const query: Record<string, string> = { ...(divisi ? { divisi } : {}), ...(state ? { status: state } : {}), ...(q?.trim() ? { q: q.trim() } : {}) };
  const narrowed = [divisi ? `Divisi ${divisi}` : null, state ? STATE_LABEL[state] : null, q?.trim() ? `pencarian “${q.trim()}”` : null].filter(Boolean).join(" · ");
  const shown = paginate(others, hal, PAGE_SIZE);
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
        <h1 className="text-page">{titleFor(user.actor.role)}</h1>
        <p className="text-muted-foreground text-sm">{version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"}</p>
        <ViewNote />
        {narrowed ? (
          <p className="text-sm">
            Menampilkan {narrowed}.{" "}
            <Link href="/rka" className="text-primary underline-offset-4 hover:underline">
              Tampilkan semua baris
            </Link>
          </p>
        ) : null}
      </div>

      {overview ? (
        <RequestorOverview
          overview={overview}
          holders={{
            consolidation: `di ${ROLE_LABEL.default_owner}`,
            division_approval: `di ${ROLE_LABEL.division_owner}`,
            finance_review: `di ${ROLE_LABEL.finance}`,
            awaiting_lock: `di ${ROLE_LABEL[approvalConfig().lockRole]}`,
            locked: "final",
          }}
        />
      ) : null}

      {masters ? (
        <Card id="draft" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Draft usulan</CardTitle>
            <CardDescription>
              Isi nominal dalam Rupiah. Ketik total setahun di kolom Total RKA untuk membaginya rata ke 12 bulan, atau isi tiap bulan sendiri:
              tempel blok dari Excel langsung ke sel bulan, atau isi satu bulan lalu tekan “Isi ke kanan”. Satu COA hanya sekali per Entitas dan Pemilik.
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
          {visible.length ? (
            <form action="/rka" className="mb-4 flex flex-wrap items-end gap-3">
              {divisi ? <input type="hidden" name="divisi" value={divisi} /> : null}
              <div className="grid min-w-0 flex-1 basis-full gap-1.5 sm:max-w-sm sm:basis-0">
                <Label htmlFor="rka-q">Cari baris</Label>
                <Input key={q ?? ""} id="rka-q" name="q" type="search" defaultValue={q ?? ""} placeholder="Kode COA, nama COA atau uraian" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rka-status">Tahap</Label>
                <select key={state ?? ""} id="rka-status" name="status" defaultValue={state ?? ""} className="border-input h-9 rounded-md border bg-transparent px-3 text-sm">
                  <option value="">Semua tahap</option>
                  {APPROVAL_STATES.map((s) => (
                    <option key={s} value={s}>
                      {STATE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" variant="outline">
                Cari
              </Button>
            </form>
          ) : null}
          {others.length ? (
            <>
              <BudgetGrid lines={shown.items} totalOf={others} priorYear={prior} unit={unit} hide={await hiddenColumns(others)} />
              <Pager {...shown} query={query} />
            </>
          ) : (
            <EmptyState
              icon={FileText}
              title={narrowed ? "Tidak ada baris yang cocok." : "Belum ada baris anggaran di tahap ini."}
              description={narrowed ? "Ubah kata pencarian atau tahap, atau tampilkan semua baris." : "Baris yang sudah Anda kirim tampil di sini beserta tahapnya."}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
