"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronRight, LogOut, UserCog } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { switchPosition, actAs } from "@/app/(app)/position-actions";
import { signOut } from "@/lib/auth-client";
import { THEMES, THEME_LABEL, useTheme, type Theme } from "@/lib/theme";
import { useProgressWhile } from "./navigation-progress";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export interface SeatOption {
  id: string;
  label: string;
  /** The role the seat belongs to; seats of one role are listed together. */
  group?: string;
}

const ITEM = "data-[highlighted]:bg-accent flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none";
const HEADING = "text-muted-foreground px-3 pt-2 pb-1 text-xs font-semibold";
const LINE = <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />;
/** Admin's own seat has no id; the radio group needs a value for it. */
const SELF = "self";

function Choice({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.RadioItem value={value} className={`${ITEM} pl-8 relative`}>
      <DropdownMenu.ItemIndicator className="absolute left-2.5">
        <Check aria-hidden className="size-4" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  );
}

/**
 * One account button in the header: who is signed in and in which seat. The menu holds what belongs to that
 * person: the active position, Admin's "act as", the theme and Keluar.
 */
export function UserMenu({
  name,
  email,
  title,
  subtitle,
  positions,
  viewAs,
}: {
  name: string;
  email: string;
  /** The seat held, or the name for someone without one to show. */
  title: string;
  subtitle: string;
  /** Only for a user holding more than one position. */
  positions?: { activeId: string; options: readonly SeatOption[] } | undefined;
  /** Admin only: the seats that can be acted as. */
  viewAs?: { activeId: string | null; options: readonly SeatOption[] } | undefined;
}) {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const [pickingSeat, setPickingSeat] = useState(false);
  const [pending, startTransition] = useTransition();
  useProgressWhile(pending);

  const change = (run: () => Promise<{ ok: boolean }>) =>
    startTransition(async () => {
      const res = await run();
      if (res.ok) {
        router.replace("/");
        router.refresh();
      }
    });

  // Seats grouped by role, roles in the order they first appear; seats without a role come straight after Admin.
  const byGroup = new Map<string, SeatOption[]>();
  for (const o of viewAs?.options ?? []) byGroup.set(o.group ?? "", [...(byGroup.get(o.group ?? "") ?? []), o]);
  const groups = [...byGroup].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : 0));

  return (
    <DropdownMenu.Root onOpenChange={() => setPickingSeat(false)}>
      <DropdownMenu.Trigger
        aria-label={`Menu pengguna, ${name}`}
        className="hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/50 flex h-10 shrink-0 items-center gap-2 rounded-md px-1.5 text-left text-sm outline-none focus-visible:ring-[3px] lg:pr-2"
      >
        <span aria-hidden className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
          {initials(name)}
        </span>
        <span className="hidden max-w-56 leading-tight lg:grid">
          <span className="truncate font-medium">{title}</span>
          <span className="text-muted-foreground truncate text-xs">{subtitle}</span>
        </span>
        <ChevronDown aria-hidden className="text-muted-foreground hidden size-4 lg:block" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="bg-popover text-popover-foreground z-50 max-h-[calc(100dvh-4.5rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border p-1 shadow-lg"
        >
          {viewAs && pickingSeat ? (
            <>
              <DropdownMenu.Item
                className={ITEM}
                onSelect={(e) => {
                  e.preventDefault();
                  setPickingSeat(false);
                }}
              >
                <ArrowLeft aria-hidden className="size-4" />
                Kembali ke menu
              </DropdownMenu.Item>
              {LINE}
              <DropdownMenu.RadioGroup value={viewAs.activeId ?? SELF} onValueChange={(v) => change(() => actAs(v === SELF ? null : v))}>
                <Choice value={SELF}>Admin (saya sendiri)</Choice>
                {groups.map(([group, seats]) => (
                  <DropdownMenu.Group key={group}>
                    {group ? <DropdownMenu.Label className={HEADING}>{group}</DropdownMenu.Label> : null}
                    {seats.map((s) => (
                      <Choice key={s.id} value={s.id}>
                        {s.label}
                      </Choice>
                    ))}
                  </DropdownMenu.Group>
                ))}
              </DropdownMenu.RadioGroup>
            </>
          ) : (
            <>
              <div className="grid gap-0.5 px-3 py-2">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="text-muted-foreground truncate text-xs">{email}</div>
                <div className="text-muted-foreground text-xs">
                  {title === name ? subtitle : `${title} · ${subtitle}`}
                </div>
              </div>
              {positions ? (
                <>
                  {LINE}
                  <DropdownMenu.Label className={HEADING}>Posisi aktif</DropdownMenu.Label>
                  <DropdownMenu.RadioGroup value={positions.activeId} onValueChange={(v) => change(() => switchPosition(v))}>
                    {positions.options.map((p) => (
                      <Choice key={p.id} value={p.id}>
                        {p.label}
                      </Choice>
                    ))}
                  </DropdownMenu.RadioGroup>
                </>
              ) : null}
              {viewAs ? (
                <>
                  {LINE}
                  <DropdownMenu.Item
                    className={ITEM}
                    onSelect={(e) => {
                      e.preventDefault();
                      setPickingSeat(true);
                    }}
                  >
                    <UserCog aria-hidden className="size-4" />
                    <span className="flex-1">Bertindak sebagai…</span>
                    <ChevronRight aria-hidden className="size-4" />
                  </DropdownMenu.Item>
                </>
              ) : null}
              {LINE}
              <DropdownMenu.Label className={HEADING}>Tema</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                {THEMES.map((t) => (
                  <Choice key={t} value={t}>
                    {THEME_LABEL[t]}
                  </Choice>
                ))}
              </DropdownMenu.RadioGroup>
              {LINE}
              <DropdownMenu.Item
                onSelect={async () => {
                  await signOut();
                  router.replace("/login");
                }}
                className={ITEM}
              >
                <LogOut aria-hidden className="size-4" />
                Keluar
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
