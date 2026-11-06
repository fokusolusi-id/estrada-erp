"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseUnit, UNITS, type Unit } from "@estrada/domain";

/** The viewer's display unit for amounts, kept for every screen. Stored figures never change. */
export function UnitSwitch({ value, onChange }: { value: Unit; onChange: (unit: Unit) => Promise<void> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="grid gap-1">
      <span className="text-muted-foreground text-xs font-medium">Satuan</span>
      <select
        className="border-input text-foreground h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
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
