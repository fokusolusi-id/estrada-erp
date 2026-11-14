"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

export interface PlanningRow {
  key: string;
  name: string;
  /** Who records it, e.g. "Project Manager". */
  owner: string;
  stage: "Initiation" | "Planning";
  reference: string | null;
  recordedBy: string | null;
  recordedOn: string | null;
  canRecord: boolean;
}

export interface GateView {
  /** The approval date; null until approved. */
  on: string | null;
  /** What still stands in the way, in the user's words. */
  blockers: string[];
  canApprove: boolean;
}

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

function Message({ m }: { m: Result | null }) {
  return m ? <p className={m.ok ? "text-success text-sm" : "text-destructive text-sm"}>{m.message}</p> : null;
}

function Item({ row, onSave }: { row: PlanningRow; onSave: (key: string, reference: string) => Promise<Result> }) {
  const [reference, setReference] = useState(row.reference ?? "");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <li className="grid gap-2 rounded-lg border p-3" data-testid={`plan-${row.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{row.name}</p>
        <Badge variant={row.reference ? "default" : "outline"}>{row.reference ? "Tercatat" : "Belum"}</Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {row.owner}
        {row.reference ? ` · ${row.recordedBy ?? "–"} · ${row.recordedOn ? fmt(row.recordedOn) : ""}` : ""}
      </p>
      {row.canRecord ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => setMessage(await onSave(row.key, reference)));
          }}
        >
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label htmlFor={`plan-ref-${row.key}`}>Rujukan (tempat berkas disimpan)</Label>
            <Input id={`plan-ref-${row.key}`} maxLength={500} value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={pending || !reference.trim() || reference.trim() === (row.reference ?? "")}>
            {row.reference ? "Ubah" : "Catat"}
          </Button>
        </form>
      ) : row.reference ? (
        <p className="text-sm">{row.reference}</p>
      ) : null}
      <Message m={message} />
    </li>
  );
}

function Gate({
  title,
  help,
  view,
  extra,
  onApprove,
  approveLabel,
  testId,
  valid = true,
}: {
  title: string;
  help: string;
  view: GateView;
  extra?: React.ReactNode;
  onApprove: () => Promise<Result>;
  approveLabel: string;
  testId: string;
  valid?: boolean;
}) {
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section className="grid gap-3 rounded-lg border p-4" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={view.on ? "default" : "outline"} data-testid="state">
          {view.on ? `Disahkan ${fmt(view.on)}` : view.blockers.length ? "Belum memenuhi syarat" : "Menunggu Head PMO"}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">{help}</p>
      {!view.on && view.blockers.length ? (
        <ul className="text-muted-foreground list-disc pl-5 text-sm" data-testid="blockers">
          {view.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {extra}
      {!view.on && view.canApprove ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Message m={message} />
          <Button size="sm" disabled={pending || view.blockers.length > 0 || !valid} onClick={() => startTransition(async () => setMessage(await onApprove()))}>
            {approveLabel}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Initiation and Planning: the records of the kick-off and the plan, the Kick-Off Gate and the baseline the Head PMO
 * approves. Field work starts after the baseline; a change after it is a change order.
 */
export function ProjectPlanning({
  items,
  gate,
  baseline,
  rfsTargetOn,
  onSave,
  onApproveGate,
  onApproveBaseline,
}: {
  items: PlanningRow[];
  gate: GateView;
  baseline: GateView;
  /** The approved target RFS date, when the baseline is approved. */
  rfsTargetOn: string | null;
  onSave: (key: string, reference: string) => Promise<Result>;
  onApproveGate: () => Promise<Result>;
  onApproveBaseline: (rfsTargetOn: string) => Promise<Result>;
}) {
  const [target, setTarget] = useState(rfsTargetOn ?? "");
  const stage = (s: PlanningRow["stage"]) => items.filter((i) => i.stage === s);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <p className="text-sm font-medium">1. Initiation</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {stage("Initiation").map((i) => (
            <Item key={i.key} row={i} onSave={onSave} />
          ))}
        </ul>
        <Gate
          testId="gate-kickoff"
          title="Kick-Off Gate"
          help="Head PMO memvalidasi kelayakan proyek yang masuk setelah kick-off dan MoM-nya tercatat."
          view={gate}
          onApprove={onApproveGate}
          approveLabel="Sahkan Kick-Off Gate"
        />
      </div>
      <div className="grid gap-3">
        <p className="text-sm font-medium">2. Planning</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          {stage("Planning").map((i) => (
            <Item key={i.key} row={i} onSave={onSave} />
          ))}
        </ul>
        <Gate
          testId="gate-baseline"
          title="Baseline rencana kerja"
          help="Head PMO mengesahkan rencana beserta target RFS. Pekerjaan lapangan dimulai sesudahnya, dan perubahan berikutnya menjadi change order."
          view={baseline}
          valid={!!target}
          onApprove={() => onApproveBaseline(target)}
          approveLabel="Sahkan baseline"
          extra={
            baseline.on ? (
              <p className="text-sm">Target RFS: {rfsTargetOn ? fmt(rfsTargetOn) : "–"}</p>
            ) : baseline.canApprove ? (
              <div className="grid gap-1.5">
                <Label htmlFor="rfs-target">Target RFS</Label>
                <Input id="rfs-target" type="date" className="w-44" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );
}
