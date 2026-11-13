"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; message: string };

/** The Sales Head's written recovery plan for a segment whose weighted coverage is below 1,0x. */
export function PipelineRecovery({
  segment,
  plan,
  signedBy,
  canEdit,
  onSave,
}: {
  segment: string;
  plan: string | null;
  /** Who wrote it and when, e.g. "Budi · 13 Nov 2026". */
  signedBy: string | null;
  canEdit: boolean;
  onSave: (segment: string, plan: string) => Promise<Result>;
}) {
  const [text, setText] = useState(plan ?? "");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const id = `recovery-${segment}`;

  return (
    <div className="grid gap-2 rounded-lg border p-4" data-testid={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          Rencana pemulihan · {segment}
        </label>
        {plan ? <span className="text-muted-foreground text-xs">{signedBy}</span> : <span className="text-destructive text-xs font-medium">Belum ditulis, wajib dari Sales Head</span>}
      </div>
      {canEdit ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => setMessage(await onSave(segment, text)));
          }}
        >
          <textarea
            id={id}
            rows={3}
            maxLength={2000}
            className="border-input focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            placeholder="Langkah, deal yang dikejar dan tenggatnya"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
            <Button type="submit" size="sm" disabled={pending || text.trim().length < 10 || text.trim() === (plan ?? "")}>
              Simpan rencana
            </Button>
          </div>
        </form>
      ) : plan ? (
        <p className="text-sm whitespace-pre-wrap">{plan}</p>
      ) : null}
    </div>
  );
}
