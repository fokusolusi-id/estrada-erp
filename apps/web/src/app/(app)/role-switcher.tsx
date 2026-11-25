"use client";

import { useTransition } from "react";
import { useProgressWhile } from "@/components/erp/navigation-progress";
import { useRouter } from "next/navigation";
import { UserCog } from "lucide-react";
import { actAs } from "./position-actions";

export interface ActAsOption {
  id: string;
  label: string;
  /** The role the seat belongs to; seats of one role are listed together. */
  group?: string;
}

/** Admin only: act as a seat of another role to see and use the app as that role does. */
export function RoleSwitcher({ options, activeId }: { options: ActAsOption[]; activeId: string | null }) {
  const router = useRouter();
  // Seats grouped by role, roles in the order they first appear; seats without a role come straight after Admin.
  const byGroup = new Map<string, ActAsOption[]>();
  for (const o of options) byGroup.set(o.group ?? "", [...(byGroup.get(o.group ?? "") ?? []), o]);
  const groups = [...byGroup].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0));
  const [pending, startTransition] = useTransition();
  useProgressWhile(pending);
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
        {groups.map(([group, seats]) => {
          const items = seats.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ));
          return group ? (
            <optgroup key={group} label={group}>
              {items}
            </optgroup>
          ) : (
            items
          );
        })}
      </select>
    </label>
  );
}
