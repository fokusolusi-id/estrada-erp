import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { openVersion } from "@/lib/rka";
import { loadOrg } from "@/lib/workflow";
import { ProvisionalCoa, type CoaOption } from "@/components/erp/provisional-coa";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { confirmCoa, remapCoa } from "./actions";
import { CoaForm } from "./coa-form";

export const metadata: Metadata = { title: "COA Master" };

export default async function CoaPage() {
  const user = await requireUser();
  if (!can(user.actor, "coa.manage", null, await loadOrg())) redirect("/");

  const version = await openVersion();
  const [accounts, units, usage] = await Promise.all([
    db.select().from(schema.coaAccount).orderBy(asc(schema.coaAccount.code)),
    db.select({ code: schema.orgUnit.code, name: schema.orgUnit.name }).from(schema.orgUnit).orderBy(asc(schema.orgUnit.code)),
    // Counts only: Admin never sees budget amounts.
    version
      ? db
          .select({ code: schema.budgetLine.coaCode, n: count() })
          .from(schema.budgetLine)
          .where(eq(schema.budgetLine.versionId, version.id))
          .groupBy(schema.budgetLine.coaCode)
      : Promise.resolve([]),
  ]);
  const linesOf = new Map(usage.map((u) => [u.code, u.n]));
  const options: CoaOption[] = accounts.map((a) => ({
    code: a.code,
    name: a.name,
    category: a.category,
    active: a.active,
    provisional: a.provisional,
    lines: linesOf.get(a.code) ?? 0,
  }));
  const provisionalCount = accounts.filter((a) => a.provisional).length;

  return (
    <div className="grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold">COA Master</h1>
        <p className="text-muted-foreground text-sm">
          {accounts.length} kode · {provisionalCount} sementara · baris dihitung dari {version ? version.name : "—"}
        </p>
      </div>

      <Card className={provisionalCount ? "border-warning" : undefined}>
        <CardHeader>
          <CardTitle>Kode sementara dari workbook</CardTitle>
          <CardDescription>
            Kode ini dipakai di RKA tetapi belum ada di COA Master. Konfirmasi sebagai akun baru, atau pindahkan barisnya ke kode yang
            sudah ada dengan kategori yang sama.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionalCoa accounts={options} onConfirm={confirmCoa} onRemap={remapCoa} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tambah atau ubah COA</CardTitle>
        </CardHeader>
        <CardContent>
          <CoaForm
            accounts={accounts.map((a) => ({ code: a.code, name: a.name, category: a.category, defaultOwnerUnit: a.defaultOwnerUnit, active: a.active, guidance: a.guidance }))}
            units={units}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar COA</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Default owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Baris</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.code}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell className="whitespace-normal">{a.name}</TableCell>
                  <TableCell>{a.category}</TableCell>
                  <TableCell>{a.defaultOwnerUnit ?? "—"}</TableCell>
                  <TableCell>
                    {a.provisional ? (
                      <Badge className="bg-warning/20 text-foreground border-transparent">Sementara</Badge>
                    ) : a.active ? (
                      "Aktif"
                    ) : (
                      <span className="text-muted-foreground">Nonaktif</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{linesOf.get(a.code) ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
