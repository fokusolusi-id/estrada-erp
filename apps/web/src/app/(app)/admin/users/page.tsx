import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ROLES, ROLE_LABEL } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Pengguna" };

export default async function UsersPage() {
  const user = await requireUser();
  if (user.actor.role !== "admin") redirect("/");

  const [users, units, entityRows] = await Promise.all([
    db.select().from(schema.user).orderBy(asc(schema.user.name)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).orderBy(asc(schema.companyEntity.code)),
  ]);

  return (
    <div className="grid max-w-5xl gap-6">
      <h1 className="text-2xl font-semibold">Pengguna</h1>
      <Card>
        <CardHeader>
          <CardTitle>Undang pengguna</CardTitle>
          <CardDescription>Pengguna menerima email untuk membuat kata sandi. Tidak ada pendaftaran mandiri.</CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm units={units} roles={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} entities={entityRows.map((e) => ({ value: e.code, label: e.code }))} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant={u.active ? "default" : "outline"}>{u.active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/users/${u.id}`} className="text-primary text-sm underline-offset-4 hover:underline">
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
