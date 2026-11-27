"use client";

import { useState, useTransition } from "react";
import { COMPLIANCE_STATUSES, COMPLIANCE_STATUS_LABEL, type ComplianceStatus } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string };
export interface ComplianceValues {
  code: string;
  status: ComplianceStatus;
  evidenceUrl: string;
  note: string;
}

/** A checklist row's status, evidence link and note, opened from the row. */
export function ComplianceForm({ initial, name, onSave }: { initial: ComplianceValues; name: string; onSave: (v: ComplianceValues) => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const message = result ? <p role="status" className={`text-xs ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  if (!open) {
    return (
      <div className="grid justify-items-start gap-1">
        <Button type="button" size="sm" variant="ghost" aria-label={`Ubah status ${name}`} onClick={() => setOpen(true)}>
          Ubah status
        </Button>
        {message}
      </div>
    );
  }
  return (
    <form
      className="grid w-64 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await onSave(v);
          setResult(r);
          if (r.ok) setOpen(false);
        });
      }}
    >
      <select
        aria-label="Status"
        className="border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
        value={v.status}
        onChange={(e) => setV({ ...v, status: e.target.value as ComplianceStatus })}
      >
        {COMPLIANCE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {COMPLIANCE_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <Input aria-label="Tautan bukti" placeholder="Tautan bukti (https://…)" className="h-8" value={v.evidenceUrl} onChange={(e) => setV({ ...v, evidenceUrl: e.target.value })} />
      <Input aria-label="Catatan" placeholder="Catatan" className="h-8" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Simpan
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => (setV(initial), setOpen(false))}>
          Batal
        </Button>
      </div>
      {message}
    </form>
  );
}
