"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { whereAmI, type NavItem } from "@/lib/nav";

/** The header's answer to "where am I": menu group, then the screen. */
export function Breadcrumb({ items }: { items: readonly NavItem[] }) {
  const here = whereAmI(usePathname(), items);
  if (!here) return null;
  return (
    <nav aria-label="Lokasi" className="hidden min-w-0 items-center gap-1.5 md:flex">
      {here.group ? (
        <>
          <span className="text-muted-foreground">{here.group}</span>
          <ChevronRight aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
        </>
      ) : null}
      {here.deeper ? (
        <Link href={here.href} className="text-primary truncate underline-offset-4 hover:underline">
          {here.label}
        </Link>
      ) : (
        <span aria-current="page" className="truncate font-medium">
          {here.label}
        </span>
      )}
    </nav>
  );
}
