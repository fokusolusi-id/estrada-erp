import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { masterAccess } from "@/lib/master";
import { activeYear } from "@/lib/fiscal-year";
import { requireUser } from "@/lib/session";
import { MasterWorkspace } from "@/components/erp/master-workspace";
import { PeriodBoard } from "@/components/erp/period-board";
import { changePeriod } from "./actions";

export const metadata: Metadata = { title: "Periode" };

const when = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export default async function PeriodPage({ searchParams }: PageProps<"/master/periode">) {
  const user = await requireUser();
  const { may, employees, requests, costCenters, periods: allowed } = await masterAccess();
  if (!allowed) redirect("/master/customer");
  const asked = Number((await searchParams).tahun);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : ((await activeYear()) ?? new Date().getFullYear());
  const [entities, rows, users] = await Promise.all([
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true)).orderBy(asc(schema.companyEntity.code)),
    db.select().from(schema.fiscalPeriod).where(eq(schema.fiscalPeriod.year, year)),
    db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const covered = entities.map((e) => e.code).filter((e) => user.actor.entities.includes("*") || user.actor.entities.includes(e));

  return (
    <MasterWorkspace active="/master/periode" employees={employees} requests={requests} costCenters={costCenters} periods steward="Periode per PT dan bulan. Bulan yang ditutup menolak tanggal pembayaran di dalamnya.">
      <div className="grid gap-4">
        <nav aria-label="Tahun" className="flex gap-2 text-sm">
          {[year - 1, year, year + 1].map((y) => (
            <Link key={y} href={`/master/periode?tahun=${y}`} aria-current={y === year ? "page" : undefined} className={y === year ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}>
              {y}
            </Link>
          ))}
        </nav>
        <PeriodBoard
          key={year}
          year={year}
          entities={covered}
          periods={rows.map((r) => ({
            entity: r.entityCode,
            month: r.month,
            status: r.status,
            note: r.closedAt ? `${name.get(r.closedBy ?? "") ?? ""} · ${when.format(r.closedAt)}` : null,
          }))}
          mayClose={may("period.close")}
          mayReopen={may("period.reopen")}
          onChange={changePeriod}
        />
      </div>
    </MasterWorkspace>
  );
}
