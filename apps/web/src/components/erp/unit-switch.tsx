"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseUnit, UNITS, type Unit } from "@estrada/domain";

/** The viewer's display unit for amounts, kept for every screen. Stored figures never change. */
export function UnitSwitch({ value, onChange }: { value: Unit; onChange: (unit: Unit) => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="text-muted-foreground flex items-center gap-2 text-sm">
      Satuan
      <select
        className="border-input text-foreground h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        value={value}
        disabled={pending}
        onChange={(e) => {
          const unit = parseUnit(e.target.value);
          startTransition(async () => {
            await onChange(unit);
            router.refresh();
          });
        }}
      >
        {UNITS.map((u) => (
          <option key={u.value} value={u.value}>
            {u.label}
          </option>
        ))}
      </select>
    </label>
  );
}
