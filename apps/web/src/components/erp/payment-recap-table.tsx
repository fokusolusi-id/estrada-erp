import Link from "next/link";
import { formatIdr, type Money } from "@estrada/domain";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface RecapRow {
  id: string;
  number: string;
  entity: string;
  paidOn: string;
  description: string;
  nett: Money;
  bank: string;
}

export interface RecapView {
  groups: { key: string; label: string; rows: RecapRow[]; total: Money }[];
  byBank: { bank: string; total: Money }[];
  total: Money;
}

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Rekap Pembayaran: Tanggal, Deskripsi, Nominal (nett) and Bank asal, a subtotal per day or month, and totals per bank. */
export function PaymentRecapTable({ recap }: { recap: RecapView }) {
  return (
    <div className="grid gap-6">
      <Table data-testid="recap-table">
        <TableHeader>
          <TableRow>
            <TableHead>Tanggal bayar</TableHead>
            <TableHead>Nomor</TableHead>
            <TableHead>Deskripsi</TableHead>
            <TableHead>Entitas</TableHead>
            <TableHead>Bank asal</TableHead>
            <TableHead className="text-right">Nominal (nett)</TableHead>
          </TableRow>
        </TableHeader>
        {recap.groups.map((g) => (
          <TableBody key={g.key} data-testid={`recap-group-${g.key}`}>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableCell colSpan={5} className="font-medium">
                {g.label}
              </TableCell>
              <TableCell className="tabular text-right font-semibold" data-testid={`recap-subtotal-${g.key}`}>
                {formatIdr(g.total)}
              </TableCell>
            </TableRow>
            {g.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{DATE.format(new Date(`${r.paidOn}T00:00:00Z`))}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  <Link href={`/pembayaran/${r.id}`} className="text-primary hover:underline">
                    {r.number}
                  </Link>
                </TableCell>
                <TableCell className="max-w-80 truncate" title={r.description}>
                  {r.description}
                </TableCell>
                <TableCell>{r.entity}</TableCell>
                <TableCell className="whitespace-nowrap">{r.bank}</TableCell>
                <TableCell className="tabular text-right">{formatIdr(r.nett)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        ))}
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="font-semibold">
              Total
            </TableCell>
            <TableCell className="tabular text-right font-semibold" data-testid="recap-total">
              {formatIdr(recap.total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Per bank asal</h3>
        <ul className="divide-border grid divide-y rounded-md border text-sm" aria-label="Total per bank asal">
          {recap.byBank.map((b) => (
            <li key={b.bank} className="flex justify-between gap-4 px-3 py-2">
              <span>{b.bank}</span>
              <span className="tabular font-medium">{formatIdr(b.total)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
