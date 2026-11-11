import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL, can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColumnHead, EntityForm, UnitForm } from "./master-forms";
import { ENTITY_GRID, UNIT_GRID } from "./grid";

export const metadata: Metadata = { title: "Unit & Entitas" };

export default async function MasterPage() {
  const user = await requireUser();
  if (!can(user.actor, "org.manage", null, await loadOrg())) redirect("/");

  const [units, entities] = await Promise.all([
    db.select().from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    db.select().from(schema.companyEntity).orderBy(asc(schema.companyEntity.code)),
  ]);
  const parents = units.map((u) => ({ value: u.code, label: `${u.code} · ${u.name}` }));

  return (
    <div className="grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Unit & Entitas</h1>
        <p className="text-muted-foreground text-sm">
          Pilihan Unit dan Entitas di seluruh aplikasi berasal dari daftar ini. Kode tidak bisa diubah setelah dibuat.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Unit</CardTitle>
          <CardDescription>Tabel org_unit (FRM, HCM, SCM, dst).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ColumnHead cols={UNIT_GRID} labels={["Kode", "Nama", "Tipe", "Induk", ""]} />
          <div className="divide-border -mt-3 divide-y border-b *:py-3">
            {units.map((u) => (
              <UnitForm key={u.code} unit={{ code: u.code, name: u.name, type: u.type, parentCode: u.parentCode }} parents={parents} />
            ))}
          </div>
          <div className="bg-muted/40 -mx-2 mt-1 rounded-lg border border-dashed p-3"><p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">Tambah baru</p>
            <UnitForm parents={parents} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Entitas</CardTitle>
          <CardDescription>Tabel company_entity (ESTRADA, MATRIK, DJALU, PAS).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ColumnHead cols={ENTITY_GRID} labels={["Kode", "Nama", "Jenis biaya", "Status", ""]} />
          <div className="divide-border -mt-3 divide-y border-b *:py-3">
            {entities.map((e) => (
              <EntityForm key={e.code} entity={{ code: e.code, name: e.name, costType: e.costType, active: e.active }} />
            ))}
          </div>
          <div className="bg-muted/40 -mx-2 mt-1 rounded-lg border border-dashed p-3"><p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">Tambah baru</p>
            <EntityForm />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Role</CardTitle>
          <CardDescription>
            Role tetap di kode karena setiap role punya aturan izin (can()) dan alur persetujuan sendiri. Menambah role perlu perubahan kode.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ROLES.map((r) => <Badge key={r} variant="outline">{ROLE_LABEL[r]}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}
