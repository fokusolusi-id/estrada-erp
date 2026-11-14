"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

/**
 * The contract's number of sites: the divisor of progress. BCD changes it, with the reason, until the BAST is approved;
 * it cannot drop below the sites already registered.
 */
export function ProjectContract({
  contractSites,
  registered,
  canChange,
  locked,
  onChange,
}: {
  contractSites: number;
  registered: number;
  canChange: boolean;
  /** BAST approved or project closed: the count is final. */
  locked: boolean;
  onChange: (contractSites: number, reason: string) => Promise<Result>;
}) {
  const [count, setCount] = useState(String(contractSites));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const next = Number(count);
  const valid = Number.isInteger(next) && next >= 1 && next !== contractSites && next >= registered && !!reason.trim();

  return (
    <div className="grid gap-3" data-testid="project-contract">
      <p className="text-sm">
        Jumlah lokasi kontrak <span className="tabular font-semibold">{contractSites}</span>
        <span className="text-muted-foreground"> · {registered} terdaftar{locked ? " · tidak dapat diubah lagi" : ""}</span>
      </p>
      {canChange && !locked ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await onChange(next, reason);
              setMessage(result);
              if (result.ok) setReason("");
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="contract-count">Jumlah baru</Label>
            <Input id="contract-count" type="number" min={Math.max(1, registered)} className="w-28" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label htmlFor="contract-reason">Dasar perubahan</Label>
            <Input id="contract-reason" placeholder="Nomor addendum kontrak" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={pending || !valid}>
            Ubah jumlah lokasi
          </Button>
        </form>
      ) : null}
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
    </div>
  );
}
