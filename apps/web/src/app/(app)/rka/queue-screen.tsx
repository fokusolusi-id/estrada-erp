import { notFound } from "next/navigation";
import type { ApprovalState, Role } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { ApprovalQueue, type QueueLine } from "@/components/erp/approval-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actOnLines } from "./actions";

/** Shared body of the approver screens: lines in the given states that this position may see. */
export async function QueueScreen({
  title,
  description,
  roles,
  states,
}: {
  title: string;
  description: string;
  roles: readonly Role[];
  states: readonly ApprovalState[];
}) {
  const user = await requireUser();
  if (!roles.includes(user.actor.role)) notFound();

  const [version, scoped] = await Promise.all([openVersion(), loadScopedLines(user, states)]);
  const lines: QueueLine[] = scoped.map((l) => ({
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
    ...(l.rka2026 ? { rka2026: l.rka2026.toFixed() } : {}),
    ...(l.actual2026 ? { actual2026: l.actual2026.toFixed() } : {}),
    ...(l.flags?.length ? { flags: l.flags } : {}),
    ...(l.remark ? { remark: l.remark } : {}),
    ...(l.item ? { item: l.item } : {}),
    ...(l.basis ? { basis: l.basis } : {}),
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{version ? version.name : "Belum ada siklus RKA yang dibuka"} · Rp juta</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Menunggu tindakan</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ApprovalQueue lines={lines} unit="juta" onAction={actOnLines} />
        </CardContent>
      </Card>
    </div>
  );
}
