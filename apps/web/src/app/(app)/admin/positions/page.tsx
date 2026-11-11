import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL, blockedSeats, can, orgChart } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { OrgChart } from "@/components/erp/org-chart";
import { ActingForm, CreatePositionForm } from "./position-forms";

export const metadata: Metadata = { title: "Struktur Organisasi" };

export default async function PositionsPage({ searchParams }: { searchParams: Promise<{ tampilan?: string; unit?: string }> }) {
  const { tampilan, unit: unitParam } = await searchParams;
  const asList = tampilan === "daftar";
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "org.manage", null, org)) redirect("/");

  const [positions, users, units, entityRows, version] = await Promise.all([
    db.select().from(schema.position).orderBy(asc(schema.position.orgUnitCode), asc(schema.position.title)),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user).orderBy(asc(schema.user.name)),
    db
      .select({ code: schema.orgUnit.code, name: schema.orgUnit.name, type: schema.orgUnit.type, parent: schema.orgUnit.parentCode, validTo: schema.orgUnit.validTo })
      .from(schema.orgUnit)
      .orderBy(asc(schema.orgUnit.code)),
    db.select({ code: schema.companyEntity.code, name: schema.companyEntity.name }).from(schema.companyEntity).orderBy(asc(schema.companyEntity.code)),
    openVersion(),
  ]);
  // Counts only: Admin never sees budget content.
  const waiting = version
    ? await db
        .select({ ownerUnit: schema.budgetLine.ownerUnit, state: schema.budgetLine.state })
        .from(schema.budgetLine)
        .where(eq(schema.budgetLine.versionId, version.id))
    : [];
  const blocked = blockedSeats(
    waiting,
    positions.map((p) => ({ orgUnit: p.orgUnitCode, role: p.role, holder: p.holderUserId, acting: p.actingUserId })),
    org,
  );

  const missing = blocked.find((b) => !b.exists);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const userOptions = users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }));
  const unitOptions = units.map((u) => ({ value: u.code, label: `${u.code} · ${u.name}` }));
  const entityOptions = entityRows.map((e) => ({ value: e.code, label: e.code }));
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  // Units that have ended (valid_to in the past) are history and stay off the chart.
  const today = new Date().toISOString().slice(0, 10);
  const chart = orgChart(
    units.filter((u) => !u.validTo || u.validTo >= today),
    positions.map((p) => ({ id: p.id, orgUnit: p.orgUnitCode, title: p.title, role: p.role, holder: p.holderUserId, acting: p.actingUserId, holderName: p.holderName })),
  );
  const createDefaults = unitParam && units.some((u) => u.code === unitParam) ? { orgUnit: unitParam } : missing ? { orgUnit: missing.unit, role: missing.role } : null;
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Struktur Organisasi</h1>
          <p className="text-muted-foreground text-sm">
            Unit dari Unit & Entitas, posisi dan pemegangnya di sini. Hak akses mengikuti posisi; posisi kepala yang kosong tidak dieskalasi ke atasan:
            tetapkan pejabat sementara (pjs).
          </p>
        </div>
        <nav aria-label="Tampilan" className="bg-muted flex gap-1 rounded-lg p-1">
          <Link href="/admin/positions" aria-current={asList ? undefined : "page"} className={tab(!asList)}>
            Bagan
          </Link>
          <Link href="/admin/positions?tampilan=daftar" aria-current={asList ? "page" : undefined} className={tab(asList)}>
            Daftar
          </Link>
        </nav>
      </div>

      {blocked.length ? (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle>RKA tertahan karena posisi kosong</CardTitle>
            <CardDescription>Baris di bawah tidak bisa diproses sampai posisinya diisi pjs.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Posisi</TableHead>
                  <TableHead>Keadaan</TableHead>
                  <TableHead className="text-right">Baris menunggu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blocked.map((b) => (
                  <TableRow key={`${b.unit}:${b.role}`}>
                    <TableCell>{b.unit}</TableCell>
                    <TableCell>{ROLE_LABEL[b.role]}</TableCell>
                    <TableCell>{b.exists ? "Kosong: tetapkan pjs di tabel posisi" : "Belum ada posisi: buat posisi dengan pjs di bawah"}</TableCell>
                    <TableCell className="text-right">{b.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {asList ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Bagan organisasi</CardTitle>
            <CardDescription>Klik orang atau posisi untuk menetapkan pemegang atau pjs. Kuning berarti posisi kosong.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrgChart roots={chart} nameOf={nameOf} />
          </CardContent>
        </Card>
      )}

      {asList ? (
      <>
      <Card id="buat">
        <CardHeader>
          <CardTitle>Buat posisi</CardTitle>
          <CardDescription>Posisi baru dibuat kosong. Pilih pjs bila kepalanya belum ada.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreatePositionForm
            units={unitOptions}
            roles={roleOptions}
            users={userOptions}
            entities={entityOptions}
            {...(createDefaults ? { defaults: createDefaults } : {})}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Posisi</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Pemegang</TableHead>
                <TableHead>pjs</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.orgUnitCode}</TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{ROLE_LABEL[p.role]}</TableCell>
                  <TableCell>
                    {p.holderUserId ? (
                      nameOf.get(p.holderUserId)
                    ) : p.holderName ? (
                      <span>
                        {p.holderName} <span className="text-muted-foreground text-xs">(belum punya akun)</span>
                      </span>
                    ) : (
                      <Badge variant="outline">Kosong</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.holderUserId ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ActingForm positionId={p.id} current={p.actingUserId} users={userOptions} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/positions/${p.id}`} className="text-primary text-sm underline-offset-4 hover:underline">
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      ) : null}
    </div>
  );
}
