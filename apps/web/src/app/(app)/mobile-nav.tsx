"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { NavSections } from "./nav-sections";
import { Button } from "@/components/ui/button";

/** The sidebar's links on a phone: a button in the header opens them over the page. */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="md:hidden">
      <Button type="button" variant="ghost" size="sm" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <X /> : <Menu />}
      </Button>
      {open ? (
        <nav aria-label="Menu utama" className="bg-sidebar text-sidebar-foreground absolute inset-x-0 top-14 z-50 flex max-h-[calc(100dvh-3.5rem)] flex-col overflow-y-auto overscroll-contain gap-0.5 border-b p-2 shadow-md">
          <NavSections items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
