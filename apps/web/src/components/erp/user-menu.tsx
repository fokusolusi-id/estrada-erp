"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { signOut } from "@/lib/auth-client";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * The signed-in user in the header: initials and name as one button, opening a menu with who they are
 * (name, email, position and role) and Keluar. Replaces the separate name label and sign-out button.
 */
export function UserMenu({ name, email, detail }: { name: string; email: string; detail: string }) {
  const router = useRouter();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Menu pengguna, ${name}`}
        className="hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/50 flex h-9 items-center gap-2 rounded-md px-1.5 text-sm outline-none focus-visible:ring-[3px] lg:pr-2"
      >
        <span aria-hidden className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold">
          {initials(name)}
        </span>
        <span className="hidden max-w-40 truncate lg:block">{name}</span>
        <ChevronDown aria-hidden className="text-muted-foreground hidden size-4 lg:block" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="bg-popover text-popover-foreground z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border p-1 shadow-lg"
        >
          <div className="grid gap-0.5 px-3 py-2">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="text-muted-foreground truncate text-xs">{email}</div>
            <div className="text-muted-foreground truncate text-xs">{detail}</div>
          </div>
          <DropdownMenu.Separator className="bg-border -mx-1 my-1 h-px" />
          <DropdownMenu.Item
            onSelect={async () => {
              await signOut();
              router.replace("/login");
            }}
            className="data-[highlighted]:bg-accent flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none"
          >
            <LogOut aria-hidden className="size-4" />
            Keluar
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
