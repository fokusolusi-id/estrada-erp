"use client";

import { useState, useTransition } from "react";
import { VARIANCE_LABEL, type VarianceSeverity } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface VarianceRow {
  unit: string;
  coaCode: string | null;
  label: string;
  /** Already formatted. */
  budget: string;
  actual: string;
  severity: VarianceSeverity;
  sentence: string;
  /** Newest first. */
  notes: readonly { text: string; by: string; at: string }[];
  canNote: boolean;
}

type Result = { ok: boolean; message: string };

const AREA = "border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const FILTERS: readonly { value: "all" | "missing" | "escalate"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "escalate", label: "Escalate" },
  { value: "missing", label: "Belum ada catatan" },
];

/** Each cost center and account with the sheet's sentence, and the owner's root cause beneath it. */
export function VarianceTable({ rows, onSave }: { rows: readonly VarianceRow[]; onSave: (unit: string, coaCode: string | null, note: string) => Promise<Result> }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const missing = (r: VarianceRow) => r.severity === "escalate" && !r.notes.length;
  const shown = rows.filter((r) => filter === "all" || (filter === "escalate" ? r.severity === "escalate" : missing(r)));
  if (!rows.length) return <p className="text-muted-foreground text-sm">Belum ada anggaran biaya dalam cakupan Anda.</p>;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.value} type="button" size="sm" variant={filter === f.value ? "default" : "outline"} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
        <span className="text-muted-foreground text-sm">{rows.filter(missing).length} Escalate belum ada catatan</span>
      </div>
      {shown.map((r) => (
        <VarianceCard key={`${r.unit}-${r.coaCode ?? ""}`} row={r} missing={missing(r)} onSave={onSave} />
      ))}
    </div>
  );
}

function VarianceCard({ row: r, missing, onSave }: { row: VarianceRow; missing: boolean; onSave: (unit: string, coaCode: string | null, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <article data-testid={`variance-${r.unit}${r.coaCode ? `-${r.coaCode}` : ""}`} className={`grid gap-2 rounded-lg border p-3 text-sm ${r.coaCode ? "ml-6" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">{r.label}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground tabular text-xs">
            Anggaran periode {r.budget} · Realisasi {r.actual}
          </span>
          <Badge variant={r.severity === "escalate" ? "default" : r.severity === "ok" ? "outline" : "secondary"}>{VARIANCE_LABEL[r.severity]}</Badge>
        </div>
      </div>
      <p>{r.sentence}</p>
      {r.notes.map((n, i) => (
        <blockquote key={i} className="border-l-2 pl-3">
          <p>{n.text}</p>
          <footer className="text-muted-foreground text-xs">
            {n.by} · {n.at}
          </footer>
        </blockquote>
      ))}
      {missing && r.canNote ? <p className="text-warning-foreground text-xs">Catatan penyebab wajib</p> : null}
      {r.canNote ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const res = await onSave(r.unit, r.coaCode, note);
              setResult(res);
              if (res.ok) setNote("");
            });
          }}
        >
          <textarea aria-label={`Catatan penyebab ${r.label}`} className={AREA} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Penyebab selisih dan tindak lanjutnya" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" variant="outline" disabled={pending || note.trim().length < 10}>
              Simpan catatan
            </Button>
            {result ? <p className={result.ok ? "text-success text-xs" : "text-destructive text-xs"}>{result.message}</p> : null}
          </div>
        </form>
      ) : null}
    </article>
  );
}
