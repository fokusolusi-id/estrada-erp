"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { SPENDING_STATUS_LABEL, money, type PlainSpending, type PlainUnitMonitor, type Unit } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureCell } from "./money-cell";

const HEADS = ["Anggaran setahun", "Anggaran periode", "Realisasi periode", "Penyesuaian", "Komitmen", "Sisa", "Terpakai", "Selisih periode", "Perkiraan akhir tahun", "Status"];
const percent = (s: PlainSpending) => (s.utilisation ? `${money(s.utilisation).toFixed(1).replace(".", ",")}%` : "—");

/** Cost centers with their accounts folded away. Amounts arrive as strings from the server. */
export function SpendingMonitor({ units, unit }: { units: readonly PlainUnitMonitor[]; unit: Unit }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (!units.length) return <p className="text-muted-foreground text-sm">Belum ada anggaran biaya dalam cakupan Anda.</p>;
  const toggle = (code: string) => setOpen((s) => (s.has(code) ? new Set([...s].filter((c) => c !== code)) : new Set([...s, code])));
  const figures = (s: PlainSpending) => (
    <>
      {[s.budget, s.prorata, s.actual, s.adjustment, s.committed, s.remaining].map((v, i) => (
        <TableCell key={i} className="text-right">
          <FigureCell value={money(v)} unit={unit} signal={i === 5} />
        </TableCell>
      ))}
      <TableCell className="tabular text-right">{percent(s)}</TableCell>
      <TableCell className="text-right">
        <FigureCell value={money(s.variance)} unit={unit} />
      </TableCell>
      <TableCell className="text-right">{s.forecast ? <FigureCell value={money(s.forecast)} unit={unit} /> : "—"}</TableCell>
      <TableCell>
        <Badge variant={s.status === "over" ? "default" : s.status === "warning" ? "secondary" : "outline"}>{SPENDING_STATUS_LABEL[s.status]}</Badge>
      </TableCell>
    </>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cost center / COA</TableHead>
          {HEADS.map((h) => (
            <TableHead key={h} className={h === "Status" ? undefined : "text-right"}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {units.flatMap((u) => [
          <TableRow key={u.unit} data-testid={`monitor-${u.unit}`}>
            <TableCell className="font-medium">
              <button type="button" aria-expanded={open.has(u.unit)} className="flex items-center gap-1" onClick={() => toggle(u.unit)}>
                {open.has(u.unit) ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
                {u.unit}
              </button>
            </TableCell>
            {figures(u)}
          </TableRow>,
          ...(open.has(u.unit)
            ? u.accounts.map((a) => (
                <TableRow key={`${u.unit}-${a.coaCode}`} data-testid={`monitor-${u.unit}-${a.coaCode}`} className="bg-muted/30">
                  <TableCell className="min-w-56 pl-8 whitespace-normal">
                    {a.coaCode} · {a.coaName}
                  </TableCell>
                  {figures(a)}
                </TableRow>
              ))
            : []),
        ])}
      </TableBody>
    </Table>
  );
}
