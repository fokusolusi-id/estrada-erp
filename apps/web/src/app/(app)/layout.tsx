import { Suspense } from "react";
import { cookies } from "next/headers";
import { Bell } from "lucide-react";
import { ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { navFor } from "@/lib/nav";
import { loadOrg } from "@/lib/workflow";
import { activeYear, yearVersions } from "@/lib/fiscal-year";
import { displayUnit } from "@/lib/display-unit";
import { viewSetup } from "@/lib/view-filter";
import { ViewBar } from "@/components/erp/view-bar";
import { NotificationBell } from "@/components/erp/notification-bell";
import { loadNotifications } from "@/lib/notifications";
import { markNotificationsRead } from "./notification-actions";
import { setDisplayUnit } from "./unit-actions";
import { setView } from "./view-actions";
import { setFiscalYear } from "./year-actions";
import { Breadcrumb } from "./breadcrumb";
import { MobileNav } from "./mobile-nav";
import { Sidebar, SIDEBAR_COOKIE } from "./sidebar";
import { UserMenu } from "@/components/erp/user-menu";
import { ViewAsChip } from "@/components/erp/view-as-chip";
import { Button } from "@/components/ui/button";

/** Streams in after the page shell: the bell is the one header part nothing else waits on. */
async function Notifications({ userId }: { userId: string }) {
  const { items, unread } = await loadNotifications(userId);
  return <NotificationBell items={items} unread={unread} onRead={markNotificationsRead} />;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, org, { versions, years }, year, { choices, view }, unit] = await Promise.all([
    requireUser(),
    loadOrg(),
    yearVersions(),
    activeYear(),
    viewSetup(),
    displayUnit(),
  ]);
  const nav = navFor(user.actor.role, (unit) => org.isWithin(user.actor.orgUnit, unit));
  const acting = user.viewAs?.options.find((o) => o.id === user.viewAs?.activeId);
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2 md:px-6">
          <div className="flex min-w-0 items-center gap-1 text-sm">
            <MobileNav items={nav} />
            <Breadcrumb items={nav} />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm xl:gap-3">
            {acting ? <ViewAsChip label={acting.title + " · " + acting.orgUnit} /> : null}
            {user.actor.role !== "admin" ? (
              <ViewBar
                years={years}
                year={year}
                openYears={versions.filter((v) => v.status === "open").map((v) => v.fiscalYear)}
                choices={choices}
                view={view}
                unit={unit}
                onYear={setFiscalYear}
                onView={setView}
                onUnit={setDisplayUnit}
              />
            ) : null}
            <Suspense
              fallback={
                <Button type="button" variant="ghost" size="sm" disabled aria-label="Notifikasi">
                  <Bell aria-hidden />
                </Button>
              }
            >
              <Notifications userId={user.id} />
            </Suspense>
            <UserMenu
              name={user.name}
              email={user.email}
              // Admin acting as nobody has no seat to name, so the button names the person.
              title={user.viewAs && !acting ? user.name : user.positionTitle}
              subtitle={ROLE_LABEL[user.actor.role]}
              positions={
                !user.viewAs && user.positions.length > 1
                  ? {
                      activeId: user.activePositionId,
                      options: user.positions.map((p) => ({ id: p.id, label: `${p.title} · ${ROLE_LABEL[p.role]} · ${p.orgUnit}${p.acting ? " (pjs)" : ""}` })),
                    }
                  : undefined
              }
              viewAs={
                user.viewAs
                  ? { activeId: user.viewAs.activeId, options: user.viewAs.options.map((o) => ({ id: o.id, group: ROLE_LABEL[o.role], label: `${o.title} · ${o.orgUnit}` })) }
                  : undefined
              }
            />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          {/* The one column every page sits in: left aligned, same width. Pages set no outer width of their own. */}
          <div data-page className="max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
