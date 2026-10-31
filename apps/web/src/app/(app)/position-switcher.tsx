"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchPosition } from "./position-actions";

export interface PositionOption {
  id: string;
  title: string;
  roleLabel: string;
  orgUnit: string;
  acting: boolean;
}

/** For users who hold more than one position, e.g. their own plus a pjs seat. */
export function PositionSwitcher({ positions, activeId }: { positions: PositionOption[]; activeId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Posisi aktif"
      className="border-input h-8 rounded-md border bg-transparent px-2 text-sm font-medium outline-none"
      value={activeId}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        startTransition(async () => {
          const res = await switchPosition(id);
          if (res.ok) router.replace("/");
        });
      }}
    >
      {positions.map((p) => (
        <option key={p.id} value={p.id}>
          {p.title} · {p.roleLabel} · {p.orgUnit}
          {p.acting ? " (pjs)" : ""}
        </option>
      ))}
    </select>
  );
}
