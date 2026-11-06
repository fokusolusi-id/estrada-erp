import { cookies } from "next/headers";
import { Building2, UserRound } from "lucide-react";
import { ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { navFor } from "@/lib/nav";
import { MobileNav } from "./mobile-nav";
import { PositionSwitcher } from "./position-switcher";
import { SignOutButton } from "./sign-out-button";
import { RoleSwitcher } from "./role-switcher";
import { Sidebar, SIDEBAR_COOKIE } from "./sidebar";
import { ThemeSwitcher } from "./theme-switcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = navFor(user.actor.role);
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-14 items-center justify-between gap-2 border-b px-2 md:px-6">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <MobileNav items={nav} />
            <div className="min-w-0 truncate">
            {user.viewAs ? null : user.positions.length > 1 ? (
              <PositionSwitcher
                activeId={user.activePositionId}
                positions={user.positions.map((p) => ({ id: p.id, title: p.title, roleLabel: ROLE_LABEL[p.role], orgUnit: p.orgUnit, acting: p.acting }))}
              />
            ) : (
              <>
                <Building2 aria-hidden className="text-muted-foreground mr-1.5 inline size-4 align-text-bottom" />
                <span className="font-medium">{user.positionTitle}</span>
                <span className="text-muted-foreground"> · {ROLE_LABEL[user.actor.role]}</span>
              </>
            )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            {user.viewAs ? (
              <RoleSwitcher
                activeId={user.viewAs.activeId}
                options={user.viewAs.options.map((o) => ({ id: o.id, label: `${ROLE_LABEL[o.role]} · ${o.title} · ${o.orgUnit}` }))}
              />
            ) : null}
            <ThemeSwitcher />
            <span className="text-muted-foreground hidden items-center gap-1.5 sm:flex">
              <UserRound aria-hidden className="size-4" />
              {user.name}
            </span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
