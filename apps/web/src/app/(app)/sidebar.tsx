"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { NavIcon } from "./nav-icon";

export const SIDEBAR_COOKIE = "estrada_sidebar";

function active(pathname: string, href: string, items: readonly NavItem[]) {
  if (href === "/") return pathname === "/";
  if (!(pathname === href || pathname.startsWith(href + "/"))) return false;
  // The longest matching href wins, so /rka does not light up on /rka/queue.
  return !items.some((i) => i.href !== href && i.href.length > href.length && (pathname === i.href || pathname.startsWith(i.href + "/")));
}

/** Desktop sidebar: icons always, labels when expanded. The choice is kept in a cookie so the server renders it without a flash. */
export function Sidebar({ items, defaultCollapsed }: { items: readonly NavItem[]; defaultCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const pathname = usePathname();
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border hidden shrink-0 flex-col border-r transition-[width] duration-200 md:flex",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex items-center gap-2 px-3", collapsed ? "flex-col py-3" : "h-14")}>
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
      <nav aria-label="Menu utama" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {items.map((item) => {
          const on = active(pathname, item.href, items);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              aria-current={on ? "page" : undefined}
              className={cn(
                "hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                on && "bg-sidebar-accent text-primary font-medium",
                collapsed && "justify-center px-0",
              )}
            >
              <NavIcon name={item.icon} />
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.phase ? <span className="text-muted-foreground text-[10px]">Fase {item.phase}</span> : null}
                </>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
