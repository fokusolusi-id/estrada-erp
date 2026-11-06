"use client";

import { useState } from "react";

export type EntityOption = { value: string; label: string };

/**
 * Checkbox multi-select over the existing entities. Submits one `name` value per ticked box
 * (read with `formData.getAll`). "*" means every entity and clears the individual ticks.
 */
export function EntityMultiSelect({
  name = "entities",
  options,
  defaultValue = [],
}: {
  name?: string;
  options: EntityOption[];
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const all = selected.includes("*");

  function toggle(value: string) {
    setSelected((cur) => {
      if (value === "*") return cur.includes("*") ? [] : ["*"];
      const without = cur.filter((v) => v !== "*" && v !== value);
      return cur.includes(value) ? without : [...without, value];
    });
  }

  const items: EntityOption[] = [{ value: "*", label: "Semua entitas" }, ...options];

  return (
    <div role="group" className="flex flex-wrap gap-2">
      {items.map((o) => {
        const checked = selected.includes(o.value);
        const disabled = all && o.value !== "*";
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
              checked ? "border-primary bg-primary/10" : "border-input"
            } ${disabled ? "opacity-50" : ""}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(o.value)}
              className="accent-primary"
            />
            {o.label}
          </label>
        );
      })}
      {selected.map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </div>
  );
}
