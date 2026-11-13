"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BellItem {
  id: string;
  text: string;
  link: string;
  /** Already formatted on the server (WIB), so server and client render the same text. */
  when: string;
  unread: boolean;
  /** The reader is asked to change their own data (a return or a clarification). */
  needsChange: boolean;
}

/**
 * The header's notification list: every handoff, change request and new comment addressed to this user.
 * Opening an item marks it read and goes to the screen where the user acts.
 */
export function NotificationBell({ items, unread, onRead }: { items: BellItem[]; unread: number; onRead: (id?: string) => Promise<void> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const read = (id?: string) =>
    startTransition(async () => {
      await onRead(id);
      router.refresh();
    });

  return (
    <div ref={box} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="relative"
        aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : "Notifikasi"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell aria-hidden />
        {unread ? (
          <span data-testid="unread-badge" className="bg-destructive absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="bg-popover text-popover-foreground absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-lg border shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifikasi</span>
            {unread ? (
              <button type="button" className="text-primary text-xs hover:underline" onClick={() => read()}>
                Tandai semua dibaca
              </button>
            ) : null}
          </div>
          {items.length ? (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link}
                    className={cn("hover:bg-accent grid gap-0.5 px-3 py-2 text-sm", n.unread && "bg-accent/40")}
                    onClick={() => {
                      setOpen(false);
                      if (n.unread) read(n.id);
                    }}
                  >
                    <span className={cn("flex items-start gap-2", n.unread && "font-medium")}>
                      {n.unread ? <span aria-hidden className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" /> : null}
                      <span>{n.text}</span>
                    </span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      {n.when}
                      {n.needsChange ? <span className="bg-warning/20 text-foreground rounded px-1 font-medium">Perlu diubah</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">Belum ada notifikasi.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
