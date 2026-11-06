import { notFound } from "next/navigation";
import type { ApprovalState, Role } from "@estrada/domain";
import { db, schema } from "@estrada/db";
import { requireUser } from "@/lib/session";
import { loadScopedLines, openVersion } from "@/lib/rka";
import { ApprovalQueue, type QueueLine } from "@/components/erp/approval-queue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { actOnLines } from "./actions";
import { displayUnit } from "@/lib/display-unit";
import { UnitSwitch } from "@/components/erp/unit-switch";
import { PageHeader } from "@/components/erp/page-header";
import { setDisplayUnit } from "@/app/(app)/unit-actions";

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

  const [version, scoped, coa, unit] = await Promise.all([
    openVersion(),
    loadScopedLines(user, states),
    db.select({ code: schema.coaAccount.code, name: schema.coaAccount.name, parentCode: schema.coaAccount.parentCode }).from(schema.coaAccount),
    displayUnit(),
  ]);
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
      <PageHeader
        title={title}
        description={version ? version.name : "Belum ada siklus RKA yang dibuka"}
        filters={<UnitSwitch value={unit} onChange={setDisplayUnit} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Menunggu tindakan</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ApprovalQueue lines={lines} coa={coa} unit={unit} onAction={actOnLines} />
        </CardContent>
      </Card>
    </div>
  );
}
