"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

/** The Head PMO stops a project that will not be delivered, with the reason. Two steps, because it cannot be undone. */
export function ProjectDrop({ onDrop }: { onDrop: (reason: string) => Promise<Result> }) {
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3" data-testid="project-drop">
      <div className="grid max-w-xl gap-1.5">
        <Label htmlFor="drop-reason">Alasan proyek dihentikan</Label>
        <Input id="drop-reason" placeholder="Misalnya kontrak dibatalkan pelanggan" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <p className="text-sm">Proyek berstatus Drop tidak dapat diubah lagi. Lanjutkan?</p>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setMessage(await onDrop(reason));
                  setConfirming(false);
                })
              }
            >
              Ya, hentikan proyek
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" disabled={!reason.trim()} onClick={() => setConfirming(true)}>
            Hentikan proyek (Drop)
          </Button>
        )}
        {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
      </div>
    </div>
  );
}
