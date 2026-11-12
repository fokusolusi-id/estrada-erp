"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { DOCUMENT_KINDS, DOCUMENT_LABEL, type DocumentKind } from "@estrada/domain";
import { Button } from "@/components/ui/button";

export interface PaymentDoc {
  id: string;
  kind: DocumentKind | "proof";
  fileName: string;
  /** Bytes. */
  size: number;
}

type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const LABEL: Record<PaymentDoc["kind"], string> = { ...DOCUMENT_LABEL, proof: "Bukti bayar" };
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/** The documents behind a request. The requester attaches and removes them while the request is theirs. */
export function PaymentDocuments({
  requestId,
  docs,
  editable,
  onUpload,
  onRemove,
}: {
  requestId: string;
  docs: PaymentDoc[];
  editable: boolean;
  onUpload: (form: FormData) => Promise<Result>;
  onRemove: (id: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const run = (fn: () => Promise<Result>, reset = false) =>
    startTransition(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        if (reset) form.current?.reset();
        router.refresh();
      }
    });

  return (
    <div className="grid gap-3">
      {docs.length ? (
        <ul className="divide-border divide-y rounded-md border" aria-label="Dokumen">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText aria-hidden className="text-muted-foreground size-4 shrink-0" />
              <span className="w-28 shrink-0 font-medium">{LABEL[d.kind]}</span>
              <a href={`/pembayaran/${requestId}/dokumen/${d.id}`} target="_blank" rel="noreferrer" className="text-primary min-w-0 flex-1 truncate hover:underline">
                {d.fileName}
              </a>
              <span className="text-muted-foreground shrink-0 text-xs">{size(d.size)}</span>
              {editable && d.kind !== "proof" ? (
                <Button type="button" size="icon" variant="ghost" aria-label={`Hapus ${d.fileName}`} disabled={pending} onClick={() => run(() => onRemove(d.id))}>
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada dokumen.</p>
      )}
      {editable ? (
        <form
          ref={form}
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            run(() => onUpload(data), true);
          }}
        >
          <input type="hidden" name="requestId" value={requestId} />
          <select name="kind" aria-label="Jenis dokumen" className={SELECT} defaultValue="invoice">
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            type="file"
            name="file"
            aria-label="File dokumen"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            required
            className="file:bg-muted max-w-full text-sm file:mr-2 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            Lampirkan
          </Button>
          <span className="text-muted-foreground text-xs">PDF, JPG, PNG atau WEBP, maksimal 4 MB.</span>
        </form>
      ) : null}
      {result ? <p className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}>{result.message}</p> : null}
    </div>
  );
}
