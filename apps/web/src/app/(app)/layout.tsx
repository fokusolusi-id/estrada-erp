import Link from "next/link";
import { ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { navFor } from "@/lib/nav";
import { MobileNav } from "./mobile-nav";
import { PositionSwitcher } from "./position-switcher";
import { SignOutButton } from "./sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = navFor(user.actor.role);

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden w-60 shrink-0 flex-col border-r md:flex">
        <div className="px-5 py-4">
          <div className="text-primary font-semibold">ERP Estrada</div>
          <div className="text-muted-foreground text-xs">RKA 2027</div>
        </div>
        <nav aria-label="Menu utama" className="flex flex-1 flex-col gap-0.5 px-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-sidebar-accent flex items-center justify-between rounded-md px-3 py-2 text-sm"
            >
              {item.label}
              {item.phase ? <span className="text-muted-foreground text-[10px]">Fase {item.phase}</span> : null}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 items-center justify-between gap-2 border-b px-2 md:px-6">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <MobileNav items={nav} />
            <div className="min-w-0 truncate">
            {user.positions.length > 1 ? (
              <PositionSwitcher
                activeId={user.activePositionId}
                positions={user.positions.map((p) => ({ id: p.id, title: p.title, roleLabel: ROLE_LABEL[p.role], orgUnit: p.orgUnit, acting: p.acting }))}
              />
            ) : (
              <>
                <span className="font-medium">{user.positionTitle}</span>
                <span className="text-muted-foreground"> · {ROLE_LABEL[user.actor.role]}</span>
              </>
            )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{user.name}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
