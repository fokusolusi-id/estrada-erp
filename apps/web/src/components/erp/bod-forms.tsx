"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      Cetak / PDF
    </Button>
  );
}

export function HighlightForm({ scope, year, month, initial, onSave }: { scope: string; year: number; month: number; initial: string; onSave: (form: FormData) => Promise<{ ok: boolean; message: string }> }) {
  const [body, setBody] = useState(initial);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => setResult(await onSave(data)));
      }}
    >
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <textarea className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border p-3 text-sm outline-none focus-visible:ring-[3px]" name="body" aria-label="Highlight bulan ini" rows={5} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-center gap-3 print:hidden">
        <Button type="submit" disabled={pending}>
          Simpan highlight
        </Button>
        {result ? (
          <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
