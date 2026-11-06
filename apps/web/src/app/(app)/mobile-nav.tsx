"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { NavIcon } from "./nav-icon";
import { Button } from "@/components/ui/button";

/** The sidebar's links on a phone: a button in the header opens them over the page. */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button type="button" variant="ghost" size="sm" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <X /> : <Menu />}
      </Button>
      {open ? (
        <nav aria-label="Menu utama" className="bg-sidebar text-sidebar-foreground absolute inset-x-0 top-14 z-50 flex flex-col gap-0.5 border-b p-2 shadow-md">
          {items.map((item, i) => (
            <Fragment key={item.href}>
              {item.group && item.group !== items[i - 1]?.group ? (
                <div className="text-muted-foreground px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">{item.group}</div>
              ) : null}
              <Link href={item.href} onClick={() => setOpen(false)} className="hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-2.5 text-sm">
                <NavIcon name={item.icon} />
                <span className="flex-1">{item.label}</span>
                {item.phase ? <span className="text-muted-foreground text-[10px]">Fase {item.phase}</span> : null}
              </Link>
            </Fragment>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
