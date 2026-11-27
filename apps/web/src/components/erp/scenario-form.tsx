"use client";

import { useState, useTransition } from "react";
import { SCENARIOS, SCENARIO_LABEL, type ScenarioKey } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };
export interface ScenarioFields {
  revenue: string;
  cogsPct: string;
  opexPct: string;
  taxPct: string;
  dso: string;
  dpo: string;
  capex: string;
}
const DRIVERS: [keyof ScenarioFields, string][] = [
  ["revenue", "Target pendapatan (Rp)"],
  ["cogsPct", "COGS % dari pendapatan"],
  ["opexPct", "OpEx % dari pendapatan"],
  ["taxPct", "Tarif pajak %"],
  ["dso", "DSO (hari)"],
  ["dpo", "DPO (hari)"],
  ["capex", "CapEx (Rp)"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Finance's three scenarios side by side, with the share of revenue per month. */
export function ScenarioForm({
  initial,
  seasonality,
  fromRka,
  onSave,
}: {
  initial: Record<ScenarioKey, ScenarioFields>;
  seasonality: readonly string[];
  /** The RKA's totals as Normal drivers; null while the RKA has no revenue. */
  fromRka: Pick<ScenarioFields, "revenue" | "cogsPct" | "opexPct" | "capex"> | null;
  onSave: (v: { scenarios: Record<ScenarioKey, Omit<ScenarioFields, "dso" | "dpo"> & { dso: number; dpo: number }>; seasonality: string[] }) => Promise<Result>;
}) {
  const [v, setV] = useState(initial);
  const [months, setMonths] = useState([...seasonality]);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const typed = (s: ScenarioFields) => ({ ...s, dso: s.dso.trim() === "" ? -1 : Number(s.dso), dpo: s.dpo.trim() === "" ? -1 : Number(s.dpo) });

  return (
    <form
      aria-label="Asumsi skenario"
      className="grid grid-cols-[minmax(0,1fr)] gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => setResult(await onSave({ scenarios: { conservative: typed(v.conservative), normal: typed(v.normal), aggressive: typed(v.aggressive) }, seasonality: months })));
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asumsi</TableHead>
            {SCENARIOS.map((k) => (
              <TableHead key={k}>{SCENARIO_LABEL[k]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {DRIVERS.map(([field, label]) => (
            <TableRow key={field}>
              <TableCell className="whitespace-nowrap">{label}</TableCell>
              {SCENARIOS.map((k) => (
                <TableCell key={k}>
                  <Input aria-label={`${label} ${SCENARIO_LABEL[k]}`} inputMode="decimal" className="tabular min-w-36 text-right" value={v[k][field]} onChange={(e) => setV({ ...v, [k]: { ...v[k], [field]: e.target.value } })} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        <legend className="mb-2 text-sm font-medium">% pendapatan per bulan (jumlah 100)</legend>
        {MONTHS.map((m, i) => (
          <label key={m} className="grid gap-1 text-xs">
            <span className="text-muted-foreground">{m}</span>
            <Input aria-label={`Persentase ${m}`} inputMode="decimal" className="tabular text-right" value={months[i]} onChange={(e) => setMonths(months.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          Simpan skenario
        </Button>
        <Button type="button" variant="outline" disabled={!fromRka} onClick={() => fromRka && setV({ ...v, normal: { ...v.normal, ...fromRka } })}>
          Isi Normal dari RKA
        </Button>
        {fromRka ? null : <span className="text-muted-foreground text-xs">RKA belum punya baris pendapatan.</span>}
        {result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null}
      </div>
    </form>
  );
}
