"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };
type Doc = { nomor: string; tanggal: string };

const day = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (d: string) => day.format(new Date(`${d}T00:00:00Z`));

function DocRow({ kind, doc, editable, onSave }: { kind: "bard" | "baut"; doc: Doc | null; editable: boolean; onSave: (doc: Doc) => Promise<Result> }) {
  const [nomor, setNomor] = useState(doc?.nomor ?? "");
  const [tanggal, setTanggal] = useState(doc?.tanggal ?? "");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const label = kind.toUpperCase();

  return (
    <div className="grid gap-2 rounded-lg border p-3" data-testid={`telkom-${kind}`}>
      <p className="text-sm font-medium">
        {label} {doc ? <span className="text-muted-foreground font-normal">· {doc.nomor} · {fmt(doc.tanggal)}</span> : <span className="text-muted-foreground font-normal">· belum dicatat</span>}
      </p>
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => setMessage(await onSave({ nomor, tanggal })));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-nomor`}>Nomor {label}</Label>
            <Input id={`${kind}-nomor`} className="w-56" maxLength={100} value={nomor} onChange={(e) => setNomor(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${kind}-tanggal`}>Tanggal {label}</Label>
            <Input id={`${kind}-tanggal`} type="date" className="w-44" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={pending || !nomor.trim() || !tanggal}>
            {doc ? `Ubah ${label}` : `Catat ${label}`}
          </Button>
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}

/**
 * BARD and BAUT, signed before the BAST for a customer on the TELKOM scheme. BCD marks the scheme; Assurance records the
 * two documents once RFS is approved.
 */
export function ProjectTelkom({
  telkomScheme,
  bard,
  baut,
  rfsApproved,
  locked,
  canRecord,
  onScheme,
  onRecord,
}: {
  telkomScheme: boolean;
  bard: Doc | null;
  baut: Doc | null;
  rfsApproved: boolean;
  /** BAST approved: nothing changes any more. */
  locked: boolean;
  canRecord: boolean;
  onScheme: (telkomScheme: boolean) => Promise<Result>;
  onRecord: (kind: "bard" | "baut", doc: Doc) => Promise<Result>;
}) {
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={telkomScheme}
          disabled={!canRecord || locked || pending}
          onChange={(e) => startTransition(async () => setMessage(await onScheme(e.target.checked)))}
        />
        Pelanggan skema TELKOM (BARD dan BAUT dibutuhkan sebelum BAST)
      </label>
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
      {telkomScheme ? (
        <>
          {!rfsApproved ? <p className="text-muted-foreground text-sm">BARD dan BAUT dicatat setelah RFS disahkan.</p> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            <DocRow kind="bard" doc={bard} editable={canRecord && rfsApproved && !locked} onSave={(doc) => onRecord("bard", doc)} />
            <DocRow kind="baut" doc={baut} editable={canRecord && rfsApproved && !locked} onSave={(doc) => onRecord("baut", doc)} />
          </div>
        </>
      ) : null}
    </div>
  );
}
