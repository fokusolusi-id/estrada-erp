"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { keepInView } from "@/lib/keep-in-view";
import { cn } from "@/lib/utils";
import { NavSections } from "./nav-sections";

export const SIDEBAR_COOKIE = "estrada_sidebar";

/** Desktop sidebar: icons always, labels when expanded. The choice is kept in a cookie so the server renders it without a flash. */
export function Sidebar({ items, defaultCollapsed }: { items: readonly NavItem[]; defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();
  const menu = useRef<HTMLElement>(null);
  // In a short window the menu scrolls on its own: bring the page you are on into view.
  useEffect(() => {
    keepInView(menu.current, menu.current?.querySelector("[aria-current]"));
  }, [pathname, collapsed]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex shrink-0 items-center gap-2 px-3", collapsed ? "flex-col py-3" : "h-14")}>
        <Image src="/logo.png" alt="ERP Estrada" width={32} height={32} className="size-8 shrink-0" priority />
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <div className="text-primary truncate font-semibold leading-tight">ERP Estrada</div>
            <div className="text-muted-foreground truncate text-xs leading-tight">Perencanaan Anggaran</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Perluas menu" : "Ciutkan menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Perluas menu" : "Ciutkan menu"}
          className="hover:bg-sidebar-accent text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <nav ref={menu} aria-label="Menu utama" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        <NavSections items={items} pathname={pathname} collapsed={collapsed} />
      </nav>
    </aside>
  );
}
