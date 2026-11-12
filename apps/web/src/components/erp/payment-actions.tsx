"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const AREA =
  "border-input w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";

const FORWARD: Partial<Record<PaymentAction, string>> = {
  submit: "Kirim ke atasan",
  approve: "Setujui",
  verify: "Teruskan ke Head Divisi",
};

/**
 * What the viewer can do with the request now. Only the actions the server allows are passed in; the server checks
 * again when one is run.
 */
export function PaymentActions({
  requestId,
  actions,
  banks,
  today,
  missing,
  onRun,
}: {
  requestId: string;
  actions: PaymentAction[];
  /** Active company accounts of the request's entity, for scheduling. */
  banks: { id: string; label: string }[];
  /** YYYY-MM-DD, the default for dates. */
  today: string;
  /** What still blocks submitting, shown before the requester tries. */
  missing?: string[];
  onRun: (form: FormData) => Promise<Result>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  if (!actions.length) return null;

  const run = (action: PaymentAction) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("requestId", requestId);
    data.set("action", action);
    startTransition(async () => {
      const r = await onRun(data);
      setResult(r);
      if (r.ok) router.refresh();
    });
  };
  const forward = actions.find((a) => FORWARD[a]);

  return (
    <div className="grid gap-4" data-testid="payment-actions">
      {forward ? (
        <form onSubmit={run(forward)} className="grid gap-2">
          {forward === "submit" && missing?.length ? (
            <ul className="text-foreground bg-warning/15 grid gap-0.5 rounded-md px-3 py-2 text-sm" aria-label="Belum lengkap">
              {missing.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          ) : null}
          <Button type="submit" disabled={pending || (forward === "submit" && !!missing?.length)} className="w-fit">
            {FORWARD[forward]}
          </Button>
        </form>
      ) : null}

      {actions.includes("return") ? (
        <form onSubmit={run("return")} className="grid gap-2">
          <Label htmlFor="pay-return">Kembalikan ke pemohon</Label>
          <textarea id="pay-return" name="comment" required rows={2} className={AREA} placeholder="Alasan, mis. Faktur Pajak belum dilampirkan" />
          <Button type="submit" variant="outline" disabled={pending} className="w-fit">
            Kembalikan
          </Button>
        </form>
      ) : null}

      {actions.includes("schedule") ? (
        <form onSubmit={run("schedule")} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="pay-scheduled">Tanggal jadwal</Label>
            <Input id="pay-scheduled" name="scheduledOn" type="date" defaultValue={today} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-bank">Bank asal</Label>
            <select id="pay-bank" name="bankAccountId" className={SELECT} required defaultValue="">
              <option value="" disabled>
                {banks.length ? "— Pilih rekening —" : "Belum ada rekening untuk entitas ini"}
              </option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending || !banks.length}>
            Jadwalkan
          </Button>
        </form>
      ) : null}

      {actions.includes("pay") ? (
        <form onSubmit={run("pay")} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="pay-paid">Tanggal bayar</Label>
            <Input id="pay-paid" name="paidOn" type="date" defaultValue={today} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-proof">Bukti bayar</Label>
            <input
              id="pay-proof"
              name="proof"
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="file:bg-muted max-w-full text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <Button type="submit" disabled={pending}>
            Tandai sudah dibayar
          </Button>
        </form>
      ) : null}

      {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
