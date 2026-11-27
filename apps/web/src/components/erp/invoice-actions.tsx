"use client";

import { useState, useTransition } from "react";
import { INVOICE_ACTION_LABEL, type InvoiceAction } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { ok: boolean; message: string };

/** The steps the user may take on this invoice; returning or cancelling asks for a reason. */
export function InvoiceActions({ actions, onRun }: { actions: readonly InvoiceAction[]; onRun: (action: InvoiceAction, note: string) => Promise<Result> }) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const needsNote = actions.some((a) => a === "return" || a === "cancel");

  return (
    <div className="grid gap-3">
      {needsNote ? <Input aria-label="Alasan" placeholder="Alasan (wajib bila mengembalikan atau membatalkan)" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      {actions.length ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              type="button"
              variant={a === "return" || a === "cancel" ? "outline" : "default"}
              disabled={pending || ((a === "return" || a === "cancel") && !note.trim())}
              onClick={() => startTransition(async () => setResult(await onRun(a, note)))}
            >
              {INVOICE_ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Tidak ada langkah untuk Anda pada status ini.</p>
      )}
      {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
