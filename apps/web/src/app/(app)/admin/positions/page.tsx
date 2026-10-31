import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL, blockedSeats, can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActingForm, CreatePositionForm } from "./position-forms";

export const metadata: Metadata = { title: "Posisi & pjs" };

export default async function PositionsPage() {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "org.manage", null, org)) redirect("/");

  const [positions, users, units, version] = await Promise.all([
    db.select().from(schema.position).orderBy(asc(schema.position.orgUnitCode), asc(schema.position.title)),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
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
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Posisi & pjs</h1>
        <p className="text-muted-foreground text-sm">
          Hak akses mengikuti posisi. Posisi kepala yang kosong tidak dieskalasi ke atasan: tetapkan pejabat sementara (pjs).
        </p>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.orgUnitCode}</TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{ROLE_LABEL[p.role]}</TableCell>
                  <TableCell>
                    {p.holderUserId ? nameOf.get(p.holderUserId) : <Badge variant="outline">Kosong</Badge>}
                  </TableCell>
                  <TableCell>
                    {p.holderUserId ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <ActingForm positionId={p.id} current={p.actingUserId} users={userOptions} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buat posisi</CardTitle>
          <CardDescription>Posisi baru dibuat kosong. Pilih pjs bila kepalanya belum ada.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreatePositionForm
            units={unitOptions}
            roles={roleOptions}
            users={userOptions}
            {...(missing ? { defaults: { orgUnit: missing.unit, role: missing.role } } : {})}
          />
        </CardContent>
      </Card>
    </div>
  );
}
