"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Long report sections behind tabs, one on screen at a time. */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly { key: string; label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (to: number) => {
    const next = (to + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div role="tablist" aria-label={label} className="bg-muted flex w-fit max-w-full flex-wrap gap-1 rounded-lg p-1">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${t.key}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
            }}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", i === active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden={i !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
