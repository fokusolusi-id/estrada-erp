import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditRow } from "@/lib/audit";

const SELECT =
  "border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const when = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" });

/** Audit Log Viewer (SCR-AUD-01): filters in the address, newest rows first, before and after on demand. */
export function AuditLogView({
  rows,
  query,
  users,
  modules,
  events,
  exportHref,
}: {
  rows: readonly AuditRow[];
  query: Record<string, string>;
  users: readonly { id: string; name: string }[];
  modules: readonly string[];
  events: readonly { code: string; trigger: string; severity: string; retentionYears: number; inSheet: boolean }[];
  exportHref: string;
}) {
  const field = (label: string, input: React.ReactNode) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      {input}
    </label>
  );
  const select = (name: string, label: string, options: readonly { value: string; label: string }[]) =>
    field(
      label,
      <select name={name} aria-label={label} className={SELECT} defaultValue={query[name] ?? ""}>
        <option value="">Semua</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>,
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <form action="/audit" className="flex flex-wrap items-end gap-3">
        {select("user", "User", users.map((u) => ({ value: u.id, label: u.name })))}
        {select("modul", "Modul", modules.map((m) => ({ value: m, label: m })))}
        {select("kode", "Kode kejadian", events.map((e) => ({ value: e.code, label: e.code })))}
        {field("Objek", <Input name="objek" aria-label="Objek" placeholder="jenis atau ID" className="h-9 w-48" defaultValue={query.objek ?? ""} />)}
        {field("Dari tanggal", <Input name="dari" aria-label="Dari tanggal" type="date" className="h-9" defaultValue={query.dari ?? ""} />)}
        {field("Sampai tanggal", <Input name="sampai" aria-label="Sampai tanggal" type="date" className="h-9" defaultValue={query.sampai ?? ""} />)}
        <Button type="submit">Terapkan</Button>
        <Link href="/audit" className="text-muted-foreground pb-2 text-sm underline-offset-2 hover:underline">
          Hapus filter
        </Link>
        {/* A file download, so a plain link. */}
        <a href={exportHref} className="text-primary pb-2 text-sm underline-offset-2 hover:underline">
          Unduh CSV
        </a>
      </form>

      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Kejadian</TableHead>
              <TableHead>Objek</TableHead>
              <TableHead>Sebelum / sesudah</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid={`audit-${r.id}`}>
                <TableCell className="tabular align-top whitespace-nowrap">{when.format(r.at)}</TableCell>
                <TableCell className="align-top">
                  {r.user}
                  {r.ip ? <div className="text-muted-foreground text-xs">{r.ip}</div> : null}
                </TableCell>
                <TableCell className="align-top">
                  <div className="font-medium">{r.code}</div>
                  <div className="text-muted-foreground text-xs">
                    {r.module} · {r.action}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Badge variant={r.severity === "Critical" ? "default" : "outline"}>{r.severity}</Badge>
                    {r.result === "fail" ? <Badge variant="secondary">Gagal</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="max-w-56 align-top text-xs break-all whitespace-normal">{r.object}</TableCell>
                <TableCell className="align-top">
                  {r.before || r.after ? (
                    <details>
                      <summary className="cursor-pointer text-sm">Lihat</summary>
                      <pre className="bg-muted mt-1 max-h-64 max-w-md overflow-auto rounded p-2 text-xs">{JSON.stringify({ sebelum: r.before ?? null, sesudah: r.after ?? null }, null, 2)}</pre>
                    </details>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">Tidak ada kejadian yang cocok.</p>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium">Katalog kode kejadian</summary>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Kejadian</TableHead>
              <TableHead>Tingkat</TableHead>
              <TableHead>Masa simpan</TableHead>
              <TableHead>Sumber</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow key={e.code}>
                <TableCell className="font-medium">{e.code}</TableCell>
                <TableCell>{e.trigger}</TableCell>
                <TableCell>{e.severity}</TableCell>
                <TableCell>{e.retentionYears} tahun</TableCell>
                <TableCell>{e.inSheet ? "04_Audit_Log_Spec" : "Tambahan aplikasi"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </details>
    </div>
  );
}
