"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

export interface SignoffView {
  /** Approved date; null until the Head PMO approves. */
  on: string | null;
  proposedOn: string | null;
  /** Name of who declared or prepared it. */
  proposedBy: string | null;
  number?: string | null;
  /** What still stands in the way, in the user's words; empty when it may be proposed and approved. */
  blockers: string[];
  canPropose: boolean;
  canApprove: boolean;
}

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

function Row({
  kind,
  view,
  onPropose,
  onApprove,
}: {
  kind: "rfs" | "bast";
  view: SignoffView;
  onPropose: (on: string, number: string) => Promise<Result>;
  onApprove: () => Promise<Result>;
}) {
  const [on, setOn] = useState(view.proposedOn ?? "");
  const [number, setNumber] = useState(view.number ?? "");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>) => startTransition(async () => setMessage(await action()));
  const rfs = kind === "rfs";
  const title = rfs ? "RFS (Ready For Service)" : "BAST";
  const proposer = rfs ? "Project Manager" : "Project Admin";
  const state = view.on ? "Disahkan" : view.proposedOn ? "Menunggu pengesahan Head PMO" : view.blockers.length ? "Belum memenuhi syarat" : `Menunggu ${proposer}`;

  return (
    <div className="grid gap-3 rounded-lg border p-4" data-testid={`signoff-${kind}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Badge variant={view.on ? "default" : view.proposedOn ? "secondary" : "outline"} data-testid="state">
          {state}
        </Badge>
      </div>
      {view.on || view.proposedOn ? (
        <p className="text-sm">
          {view.number ? `${view.number} · ` : ""}
          {fmt((view.on ?? view.proposedOn)!)}
          <span className="text-muted-foreground">
            {" "}
            · {rfs ? "dinyatakan" : "disiapkan"} {view.proposedBy ?? proposer}
          </span>
        </p>
      ) : null}
      {!view.on && view.blockers.length ? (
        <ul className="text-muted-foreground list-disc pl-5 text-sm" data-testid="blockers">
          {view.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {!view.on && view.canPropose && !view.blockers.length ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onPropose(on, number));
          }}
        >
          {rfs ? null : (
            <div className="grid gap-1.5">
              <Label htmlFor="bast-number">Nomor BAST</Label>
              <Input id="bast-number" className="w-56" maxLength={100} value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-on`}>{rfs ? "Tanggal RFS" : "Tanggal BAST"}</Label>
            <Input id={`${kind}-on`} type="date" className="w-44" value={on} onChange={(e) => setOn(e.target.value)} />
          </div>
          <Button type="submit" size="sm" variant={view.proposedOn ? "outline" : "default"} disabled={pending || !on || (!rfs && !number.trim())}>
            {rfs ? (view.proposedOn ? "Ubah pernyataan RFS" : "Nyatakan RFS") : view.proposedOn ? "Ubah BAST" : "Siapkan BAST"}
          </Button>
        </form>
      ) : null}
      {!view.on && view.proposedOn && view.canApprove && !view.blockers.length ? (
        <div className="flex justify-end">
          <Button size="sm" disabled={pending} onClick={() => run(onApprove)}>
            {rfs ? "Sahkan RFS" : "Sahkan BAST"}
          </Button>
        </div>
      ) : null}
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
    </div>
  );
}

/**
 * RFS then BAST. The Project Manager declares RFS once every site is tested; the Project Admin prepares the BAST once
 * every contract site has a verified BAI; the Head PMO approves each. An approved BAST moves the project to Penagihan.
 */
export function ProjectSignoff({
  rfs,
  bast,
  onDeclareRfs,
  onPrepareBast,
  onApprove,
}: {
  rfs: SignoffView;
  bast: SignoffView;
  onDeclareRfs: (on: string) => Promise<Result>;
  onPrepareBast: (number: string, on: string) => Promise<Result>;
  onApprove: (kind: "rfs" | "bast") => Promise<Result>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Row kind="rfs" view={rfs} onPropose={(on) => onDeclareRfs(on)} onApprove={() => onApprove("rfs")} />
      <Row kind="bast" view={bast} onPropose={(on, number) => onPrepareBast(number, on)} onApprove={() => onApprove("bast")} />
    </div>
  );
}
