"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { menuEntry, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

/**
 * The menu's links, folded by group: the group holding the current page is open, the others open on request.
 * Reduced to icons there are no headings to click, so every screen shows.
 */
export function NavSections({
  items,
  pathname,
  collapsed = false,
  onNavigate,
}: {
  items: readonly NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const current = menuEntry(pathname, items);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [seen, setSeen] = useState(pathname);
  // Arriving on a page opens its group again, even if it was folded before.
  if (seen !== pathname) {
    setSeen(pathname);
    if (current?.group) setChosen((c) => ({ ...c, [current.group!]: true }));
  }

  const sections: { group: NavItem["group"]; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }

  return sections.map(({ group, items: own }, i) => {
    // Bantuan holds one link; folding it would only hide the way to help.
    const foldable = !!group && group !== "Bantuan" && !collapsed;
    const open = !foldable || (chosen[group!] ?? group === current?.group);
    return (
      <div key={group ?? `top-${i}`} className="flex flex-col gap-0.5">
        {foldable ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setChosen((c) => ({ ...c, [group!]: !open }))}
            className="hover:bg-sidebar-accent text-muted-foreground mt-2 flex min-h-8 items-center justify-between rounded-md px-3 text-xs font-semibold"
          >
            {group}
            {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
          </button>
        ) : group && collapsed ? (
          <hr className="border-sidebar-border mx-2 my-2" />
        ) : null}
        {open
          ? own.map((item) => {
              const on = item.href === current?.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                    on && "bg-sidebar-accent text-primary font-semibold",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <NavIcon name={item.icon} />
                  {collapsed ? null : (
                    <>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.phase ? <span className="text-muted-foreground text-xs">Fase {item.phase}</span> : null}
                    </>
                  )}
                </Link>
              );
            })
          : null}
      </div>
    );
  });
}
