import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditPositionForm } from "../../positions/position-forms";
import { UserEditForm } from "./user-edit-form";

export const metadata: Metadata = { title: "Edit pengguna" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireUser();
  if (admin.actor.role !== "admin") redirect("/");

  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id));
  if (!u) notFound();

  const [positions, units, entityRows] = await Promise.all([
    db.select().from(schema.position).where(eq(schema.position.holderUserId, id)).orderBy(asc(schema.position.title)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).orderBy(asc(schema.companyEntity.code)),
  ]);
  const scopes = await db.select().from(schema.positionEntityScope);
  const unitOptions = units.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }));
  const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const entityOptions = entityRows.map((e) => ({ value: e.code, label: e.code }));

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link href="/admin/users" className="text-muted-foreground text-sm hover:underline">
          ← Pengguna
        </Link>
        <h1 className="text-2xl font-semibold">Edit pengguna</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Akun</CardTitle>
        </CardHeader>
        <CardContent>
          <UserEditForm user={{ id: u.id, name: u.name, email: u.email, active: u.active }} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Unit, role, dan entitas</CardTitle>
          <CardDescription>Hak akses mengikuti posisi yang dipegang pengguna.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8">
          {positions.length ? (
            positions.map((p) => (
              <EditPositionForm
                key={p.id}
                position={{
                  id: p.id,
                  orgUnit: p.orgUnitCode,
                  title: p.title,
                  role: p.role,
                  entities: scopes.filter((s) => s.positionId === p.id).map((s) => s.entityCode),
                  holderUserId: p.holderUserId,
                }}
                units={unitOptions}
                roles={roleOptions}
                entities={entityOptions}
              />
            ))
          ) : (
            <p className="text-muted-foreground text-sm">Pengguna ini belum memegang posisi.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
