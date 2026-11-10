"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/** Back to Semua entitas and Semua divisi. */
export function ResetViewButton({ onReset }: { onReset: () => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="text-primary underline-offset-4 hover:underline disabled:opacity-60"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await onReset();
          router.refresh();
        })
      }
    >
      Tampilkan semua
    </button>
  );
}
