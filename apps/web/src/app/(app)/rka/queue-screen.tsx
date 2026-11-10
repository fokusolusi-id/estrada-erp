import { notFound } from "next/navigation";
import { cycleProgress, type ApprovalState, type Role } from "@estrada/domain";
import { db, schema } from "@estrada/db";
import { requireUser } from "@/lib/session";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { ProgressBoard } from "@/components/erp/progress-board";
import { ApprovalQueue, type QueueLine } from "@/components/erp/approval-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actOnLines } from "./actions";
import { displayUnit } from "@/lib/display-unit";
import { hiddenColumns, viewLines } from "@/lib/view-filter";
import { ViewNote } from "@/components/erp/view-note";
import { PageHeader } from "@/components/erp/page-header";
import { rkaLabel } from "@estrada/domain";

/** Shared body of the approver screens: lines in the given states that this position may see. */
export async function QueueScreen({
  title,
  description,
  roles,
  states,
  board = false,
}: {
  title: string;
  description: string;
  roles: readonly Role[];
  states: readonly ApprovalState[];
  /** Also shows where every division's lines stand in the cycle (the Status Board). */
  board?: boolean;
}) {
  const user = await requireUser();
  if (!roles.includes(user.actor.role)) notFound();

  const [version, scoped, coa, unit, everyLine, org] = await Promise.all([
    openVersion(),
    loadScopedLines(user, states),
    db.select({ code: schema.coaAccount.code, name: schema.coaAccount.name, parentCode: schema.coaAccount.parentCode }).from(schema.coaAccount),
    displayUnit(),
    board ? loadScopedLines(user) : Promise.resolve([]),
    loadOrg(),
  ]);
  const lines: QueueLine[] = (await viewLines(scoped)).map((l) => ({
    id: l.id,
    coaCode: l.coaCode,
    coaName: l.coaName,
    entity: l.entity,
    requestorUnit: l.requestorUnit,
    ownerUnit: l.ownerUnit,
    state: l.state,
    months: l.months.map((m) => m.toFixed()),
    actions: l.actions,
    history: l.history,
    commentCount: l.commentCount,
    ...(l.priorRka ? { priorRka: l.priorRka.toFixed() } : {}),
    ...(l.priorActual ? { priorActual: l.priorActual.toFixed() } : {}),
    ...(l.flags?.length ? { flags: l.flags } : {}),
    ...(l.remark ? { remark: l.remark } : {}),
    ...(l.item ? { item: l.item } : {}),
    ...(l.basis ? { basis: l.basis } : {}),
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title={title}
        description={version ? rkaLabel(version) : "Belum ada siklus RKA yang dibuka"}
        note={<ViewNote />}
      />
      {board ? (
        <Card>
          <CardHeader>
            <CardTitle>Posisi RKA per divisi</CardTitle>
            <CardDescription>Jumlah baris di setiap tahap, dan porsi yang sudah difinalisasi atau dikunci.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressBoard rows={cycleProgress(await viewLines(everyLine), (u) => org.divisionOf(u))} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Menunggu tindakan</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ApprovalQueue lines={lines} coa={coa} unit={unit} priorYear={(version?.fiscalYear ?? new Date().getFullYear()) - 1} onAction={actOnLines} hide={await hiddenColumns(lines)} />
        </CardContent>
      </Card>
    </div>
  );
}
