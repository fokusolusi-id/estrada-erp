"use client";

import { useState, useTransition } from "react";
import { CHANGE_STATUS_LABEL, type ChangeStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ChangeRow {
  id: string;
  title: string;
  /** `before` is null when there was nothing to compare with. */
  changes: readonly { field: string; before: string | null; after: string }[];
  reason: string;
  effectiveOn: string;
  requester: string;
  status: ChangeStatus;
  note: string | null;
  canDecide: boolean;
  canCancel: boolean;
}

type Result = { ok: boolean; message: string };

/** Requests to change a sensitive master, newest first: what changes, why, from when, and the decision. */
export function ChangeRequests({
  rows,
  onDecide,
  onCancel,
}: {
  rows: readonly ChangeRow[];
  onDecide: (id: string, decision: "approve" | "reject", note: string) => Promise<Result>;
  onCancel: (id: string) => Promise<Result>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<Result>) => startTransition(async () => setMessage(await fn()));

  if (!rows.length) return <p className="text-muted-foreground text-sm">Belum ada permintaan perubahan master.</p>;

  return (
    <div className="grid gap-3">
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
      {rows.map((r) => (
        <article key={r.id} data-testid={`change-${r.id}`} className="grid gap-2 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">{r.title}</h2>
            <Badge variant={r.status === "pending" ? "default" : "outline"}>{CHANGE_STATUS_LABEL[r.status]}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Diminta {r.requester} · berlaku {r.effectiveOn}
          </p>
          <dl className="grid gap-1">
            {r.changes.map((c) => (
              <div key={c.field} className="flex flex-wrap items-baseline gap-2">
                <dt className="text-muted-foreground w-40 text-xs">{c.field}</dt>
                <dd className="flex flex-wrap gap-2">
                  {c.before === null ? null : (
                    <>
                      <s className="text-muted-foreground">{c.before}</s>
                      <span aria-hidden>→</span>
                    </>
                  )}
                  <span className="font-medium">{c.after}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p>Alasan: {r.reason}</p>
          {r.note ? <p className="text-muted-foreground">Catatan: {r.note}</p> : null}
          {r.canDecide || r.canCancel ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {r.canDecide ? (
                <>
                  <Input aria-label={`Catatan keputusan ${r.id}`} placeholder="Catatan (wajib bila menolak)" className="h-9 min-w-56 flex-1" value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                  <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => onDecide(r.id, "reject", notes[r.id] ?? ""))}>
                    Tolak
                  </Button>
                  <Button type="button" disabled={pending} onClick={() => run(() => onDecide(r.id, "approve", notes[r.id] ?? ""))}>
                    Setujui
                  </Button>
                </>
              ) : null}
              {r.canCancel ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => onCancel(r.id))}>
                  Batalkan
                </Button>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
