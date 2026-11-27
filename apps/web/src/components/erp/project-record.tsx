"use client";

import { useState, useTransition } from "react";
import { PAYMENT_TERMS, PAYMENT_TERM_LABEL, PIC_LABEL, PIC_ROLES, type PaymentTerm, type PicRole } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string };
const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-70";
export interface ContractValues {
  p8On: string;
  number: string;
  date: string;
  duration: string;
  term: PaymentTerm | "";
  pics: Record<PicRole, string>;
}

/** The contract record in three parts, each saved by the people who own it; the others read it. */
export function ProjectRecord({
  initial,
  employees,
  may,
  onP8,
  onContract,
  onPics,
}: {
  initial: ContractValues;
  employees: readonly { nip: string; name: string }[];
  may: { p8: boolean; contract: boolean; pic: boolean };
  onP8: (receivedOn: string) => Promise<Result>;
  onContract: (v: { number: string; date: string; duration: string; term: PaymentTerm | null }) => Promise<Result>;
  onPics: (v: Record<PicRole, string>) => Promise<Result>;
}) {
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>) => startTransition(async () => setResult(await work()));
  const field = (label: string, input: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {input}
    </label>
  );
  const text = (label: string, key: "p8On" | "number" | "date" | "duration", enabled: boolean, type = "text") =>
    field(label, <Input aria-label={label} type={type} disabled={!enabled} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />);
  const save = (label: string, work: () => Promise<Result>) => (
    <div className="flex items-end">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(work)}>
        {label}
      </Button>
    </div>
  );

  return (
    <div className="grid gap-4" data-testid="project-record">
      <div className="grid gap-3 sm:grid-cols-3">
        {text("Tanggal terima P8/SPPBJ", "p8On", may.p8, "date")}
        {may.p8 ? save("Simpan P8", () => onP8(v.p8On)) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {text("No kontrak", "number", may.contract)}
        {text("Tanggal kontrak", "date", may.contract, "date")}
        {text("Durasi kontrak", "duration", may.contract)}
        {field(
          "Term of payment",
          <select aria-label="Term of payment" className={SELECT} disabled={!may.contract} value={v.term} onChange={(e) => setV({ ...v, term: e.target.value as PaymentTerm | "" })}>
            <option value="">—</option>
            {PAYMENT_TERMS.map((t) => (
              <option key={t} value={t}>
                {PAYMENT_TERM_LABEL[t]}
              </option>
            ))}
          </select>,
        )}
        {may.contract ? save("Simpan kontrak", () => onContract({ number: v.number, date: v.date, duration: v.duration, term: v.term || null })) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {PIC_ROLES.map((r) => (
          <div key={r} className="contents">
            {field(
              PIC_LABEL[r],
              <select aria-label={PIC_LABEL[r]} className={SELECT} disabled={!may.pic} value={v.pics[r]} onChange={(e) => setV({ ...v, pics: { ...v.pics, [r]: e.target.value } })}>
                <option value="">—</option>
                {employees.map((p) => (
                  <option key={p.nip} value={p.nip}>
                    {p.name}
                  </option>
                ))}
              </select>,
            )}
          </div>
        ))}
        {may.pic ? save("Simpan PIC", () => onPics(v.pics)) : null}
      </div>
      {result ? <p role="status" className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
