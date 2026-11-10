"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; message: string };

/** A one-off server action behind a button: says what happened and refreshes the page on success. */
export function ActionButton({ label, icon, onRun }: { label: string; icon?: React.ReactNode; onRun: () => Promise<Result> }) {
  const router = useRouter();
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await onRun();
            setMessage(res);
            if (res.ok) router.refresh();
          })
        }
      >
        {icon}
        {label}
      </Button>
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
    </div>
  );
}
