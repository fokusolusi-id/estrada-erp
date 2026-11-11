import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL, can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EditPositionForm } from "../position-forms";

export const metadata: Metadata = { title: "Edit posisi" };

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user.actor, "org.manage", null, await loadOrg())) redirect("/");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [pos] = await db.select().from(schema.position).where(eq(schema.position.id, id));
  if (!pos) notFound();

  const [scope, users, units, entityRows] = await Promise.all([
    db.select({ e: schema.positionEntityScope.entityCode }).from(schema.positionEntityScope).where(eq(schema.positionEntityScope.positionId, id)),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).orderBy(asc(schema.companyEntity.code)),
  ]);

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/admin/positions" className="text-muted-foreground text-sm hover:underline">
          ← Struktur Organisasi
        </Link>
        <h1 className="text-2xl font-semibold">Edit posisi</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{pos.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditPositionForm
            position={{
              id: pos.id,
              orgUnit: pos.orgUnitCode,
              title: pos.title,
              role: pos.role,
              entities: scope.map((s) => s.e),
              holderUserId: pos.holderUserId,
              holderName: pos.holderName,
            }}
            units={units.map((u) => ({ value: u.code, label: `${u.code} · ${u.name}` }))}
            roles={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            entities={entityRows.map((e) => ({ value: e.code, label: e.code }))}
            holders={users.map((u) => ({ value: u.id, label: `${u.name} · ${u.email}` }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
