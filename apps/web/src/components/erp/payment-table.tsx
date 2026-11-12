import Link from "next/link";
import { money, type PaymentState } from "@estrada/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "./money-cell";
import { PaymentStatusBadge } from "./payment-status";

export interface PaymentRow {
  id: string;
  number: string | null;
  /** YYYY-MM-DD: submitted, else created. */
  date: string;
  description: string;
  entity: string;
  requester: string;
  /** Nominal (nett), as a decimal string. */
  nett: string;
  state: PaymentState;
}

const DATE = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Permintaan Pembayaran in a list: number, date, what for, who asked, how much leaves the bank, and where it stands. */
export function PaymentTable({ rows, empty }: { rows: PaymentRow[]; empty: React.ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <Table data-testid="payment-table">
      <TableHeader>
        <TableRow>
          <TableHead>Nomor</TableHead>
          <TableHead>Tanggal</TableHead>
          <TableHead>Deskripsi</TableHead>
          <TableHead>Entitas</TableHead>
          <TableHead>Pemohon</TableHead>
          <TableHead className="text-right">Nominal (nett)</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              <Link href={`/pembayaran/${r.id}`} className="text-primary hover:underline">
                {r.number ?? "Draft"}
              </Link>
            </TableCell>
            <TableCell className="whitespace-nowrap">{DATE.format(new Date(`${r.date}T00:00:00Z`))}</TableCell>
            <TableCell className="max-w-72 truncate" title={r.description}>
              {r.description || <span className="text-muted-foreground">Tanpa deskripsi</span>}
            </TableCell>
            <TableCell>{r.entity}</TableCell>
            <TableCell className="whitespace-nowrap">{r.requester}</TableCell>
            <TableCell className="text-right">
              <MoneyCell value={money(r.nett)} />
            </TableCell>
            <TableCell>
              <PaymentStatusBadge state={r.state} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
