import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { editorMasters, loadScopedLines, openVersion } from "@/lib/rka";
import { BudgetGrid } from "@/components/erp/budget-grid";
import { BudgetEditor, type EditorLine } from "@/components/erp/budget-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteLine, saveLine, submitLines } from "./actions";

export const metadata: Metadata = { title: "RKA Saya" };

export default async function RkaPage() {
  const user = await requireUser();
  const [version, lines] = await Promise.all([openVersion(), loadScopedLines(user)]);

  const isRequestor = user.actor.role === "requestor";
  const drafts = isRequestor ? lines.filter((l) => l.state === "draft" && l.canEdit) : [];
  const others = lines.filter((l) => !drafts.includes(l));
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
    ...(l.rka2026 ? { rka2026: l.rka2026.toFixed() } : {}),
    ...(l.actual2026 ? { actual2026: l.actual2026.toFixed() } : {}),
    ...(l.flags?.length ? { flags: l.flags } : {}),
    commentCount: l.commentCount,
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">RKA Saya</h1>
        <p className="text-muted-foreground text-sm">{version ? version.name : "Belum ada siklus RKA yang dibuka"}</p>
      </div>

      {masters ? (
        <Card>
          <CardHeader>
            <CardTitle>Draft usulan</CardTitle>
            <CardDescription>
              Isi nominal dalam Rupiah. Tempel blok dari Excel langsung ke sel bulan, atau isi satu bulan lalu tekan “Isi ke kanan”.
              Simpan tiap baris, centang yang sudah siap, lalu kirim ke Default Owner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetEditor
              lines={editorLines}
              masters={masters}
              defaultEntity={masters.entities[0] ?? "ESTRADA"}
              onSave={saveLine}
              onDelete={deleteLine}
              onSubmit={submitLines}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{isRequestor ? "Sudah dikirim" : "Baris anggaran"}</CardTitle>
          <CardDescription>Rp juta. Total dihitung otomatis dari Jan–Des.</CardDescription>
        </CardHeader>
        <CardContent>
          {others.length ? (
            <BudgetGrid lines={others} unit="juta" />
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">Belum ada baris anggaran di tahap ini.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
