"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { actAs } from "./position-actions";

export interface ActAsOption {
  id: string;
  label: string;
}

/** Admin only: act as a seat of another role to see and use the app as that role does. */
export function RoleSwitcher({ options, activeId }: { options: ActAsOption[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-1.5">
      <UserCog aria-hidden className="text-muted-foreground size-4 shrink-0" />
      <select
        aria-label="Bertindak sebagai"
        className="border-input bg-background h-8 max-w-44 rounded-md border px-2 text-sm outline-none sm:max-w-64"
        value={activeId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value || null;
          startTransition(async () => {
            const res = await actAs(id);
            if (res.ok) {
              router.replace("/");
              router.refresh();
            }
          });
        }}
      >
        <option value="">Admin (saya sendiri)</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
