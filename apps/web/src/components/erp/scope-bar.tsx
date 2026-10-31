"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";

export interface ScopeFilter {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

const SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/** Report filters held in the URL, so a view can be bookmarked and shared. An empty value removes the filter. */
export function ScopeBar({ filters }: { filters: ScopeFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      {filters.map((f) => (
        <div key={f.name} className="grid gap-1">
          <Label htmlFor={`scope-${f.name}`} className="text-muted-foreground text-xs">
            {f.label}
          </Label>
          <select id={`scope-${f.name}`} className={SELECT} value={params.get(f.name) ?? f.options[0]?.value ?? ""} onChange={(e) => set(f.name, e.target.value)}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
