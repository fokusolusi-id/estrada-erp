"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { actAs } from "@/app/(app)/position-actions";
import { useProgressWhile } from "./navigation-progress";

/** While Admin acts as a seat the header says so, with the way back, so it is never forgotten. */
export function ViewAsChip({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useProgressWhile(pending);
  return (
    <div role="status" className="border-warning bg-warning/15 flex h-8 min-w-0 items-center gap-1.5 rounded-md border pl-2 text-sm max-md:flex-1">
      <Eye aria-hidden className="size-4 shrink-0" />
      {/* The account button already names the seat on a wide screen; a screen reader hears it here too. */}
      <span className="truncate whitespace-nowrap max-md:flex-1">
        Melihat sebagai<span className="md:sr-only"> {label}</span>
      </span>
      <button
        type="button"
        aria-label="Kembali ke Admin"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await actAs(null);
            if (res.ok) {
              router.replace("/");
              router.refresh();
            }
          })
        }
        className="hover:bg-warning/25 h-full shrink-0 rounded-r-md px-2 font-semibold"
      >
        Kembali
      </button>
    </div>
  );
}
