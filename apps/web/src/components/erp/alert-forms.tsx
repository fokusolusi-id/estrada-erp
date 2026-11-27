"use client";

import { useState, useTransition } from "react";
import type { AlertAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string };

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>) => startTransition(async () => setResult(await work()));
  const message = result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

export function CheckWarningsButton({ onCheck }: { onCheck: () => Promise<Result> }) {
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={pending} onClick={() => run(onCheck)}>
        Periksa sekarang
      </Button>
      {message}
    </div>
  );
}

export function AlertActions({ id, acknowledged, onAction }: { id: string; acknowledged: boolean; onAction: (id: string, action: AlertAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const { pending, run, message } = useResult();
  const button = (action: AlertAction, label: string, variant: "default" | "outline") => (
    <Button size="sm" variant={variant} disabled={pending} onClick={() => run(() => onAction(id, action, note))}>
      {label}
    </Button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {acknowledged ? null : button("ack", "Terima", "default")}
      <Input aria-label="Catatan penyelesaian" placeholder="Catatan penyelesaian" value={note} onChange={(e) => setNote(e.target.value)} className="h-8 w-64" />
      {button("resolve", "Selesaikan", "outline")}
      {button("false_positive", "Salah alarm", "outline")}
      {message}
    </div>
  );
}
