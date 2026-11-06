"use client";

import { useState, useTransition } from "react";
import { formatIdr, money, parseIdr } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const OPENING_FIELDS = [
  ["cash", "Saldo kas awal"],
  ["receivables", "Piutang awal"],
  ["payables", "Utang usaha awal"],
  ["priorYearTax", "PPh 29 tahun lalu"],
  ["minimumCash", "Kas minimum"],
] as const;
type OpeningField = (typeof OPENING_FIELDS)[number][0];

/** Amounts as plain decimal strings; the tax rate as a percent; COA lists as typed. */
export interface AssumptionsInput {
  collectionLag: string;
  cogsPaymentLag: string;
  taxRate: string;
  minimumCash: string;
  interestCoa: string;
  nonCashCoa: string;
  openings: Record<string, Record<OpeningField, string>>;
}

export interface AssumptionsSave {
  collectionLag: number;
  cogsPaymentLag: number;
  /** As a fraction, e.g. "0.22". */
  taxRate: string;
  minimumCash: string;
  interestCoa: string[];
  nonCashCoa: string[];
  openings: Record<string, Record<OpeningField, string>>;
}

type Result = { ok: boolean; message: string };

const shown = (s: string) => (s ? formatIdr(money(s), { unit: "rp" }).replace(/^(-?)Rp /, "$1") : "");
const plain = (s: string): string | null => {
  if (!s.trim()) return "0";
  try {
    return parseIdr(s).toFixed();
  } catch {
    return null;
  }
};
const codes = (s: string) => s.split(/[,\s]+/).map((c) => c.trim()).filter(Boolean);
const lag = (s: string) => (/^\d{1,2}$/.test(s.trim()) && Number(s) <= 12 ? Number(s) : null);

/** Forecast CF Bulanan's ASUMSI block: the year's cash rules and each entity's 1 January position. */
export function CashAssumptions({ initial, editable, onSave }: { initial: AssumptionsInput; editable: boolean; onSave: (a: AssumptionsSave) => Promise<Result> }) {
  const [a, setA] = useState<AssumptionsInput>(() => ({
    ...initial,
    minimumCash: shown(initial.minimumCash),
    openings: Object.fromEntries(Object.entries(initial.openings).map(([e, o]) => [e, Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shown(v)])) as Record<OpeningField, string>])),
  }));
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const rate = plain(a.taxRate);
  const save: AssumptionsSave | null = (() => {
    const collectionLag = lag(a.collectionLag);
    const cogsPaymentLag = lag(a.cogsPaymentLag);
    const minimumCash = plain(a.minimumCash);
    if (collectionLag === null || cogsPaymentLag === null || rate === null || minimumCash === null) return null;
    if (money(rate).lt(0) || money(rate).gt(100)) return null;
    const openings: AssumptionsSave["openings"] = {};
    for (const [entity, o] of Object.entries(a.openings)) {
      const row = Object.fromEntries(OPENING_FIELDS.map(([k]) => [k, plain(o[k])]));
      if (Object.values(row).some((v) => v === null)) return null;
      openings[entity] = row as Record<OpeningField, string>;
    }
    return { collectionLag, cogsPaymentLag, taxRate: money(rate).div(100).toFixed(), minimumCash, interestCoa: codes(a.interestCoa), nonCashCoa: codes(a.nonCashCoa), openings };
  })();
  const field = (label: string, key: "collectionLag" | "cogsPaymentLag" | "taxRate" | "minimumCash" | "interestCoa" | "nonCashCoa", hint?: string) => (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Input aria-label={label} disabled={!editable} value={a[key]} onChange={(e) => setA((cur) => ({ ...cur, [key]: e.target.value }))} />
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {field("Lag penagihan (bulan)", "collectionLag", "Invoice tertagih setelah n bulan")}
        {field("Lag pembayaran COGS (bulan)", "cogsPaymentLag", "OPEX, gaji dan bunga dibayar bulan berjalan")}
        {field("Tarif PPh Badan (%)", "taxRate", "Dibayar 12 angsuran dari laba setahun")}
        {field("Kas minimum konsolidasi", "minimumCash")}
        {field("COA bunga diganti Obligo", "interestCoa", "Pisahkan dengan koma")}
        {field("COA non-kas (penyusutan)", "nonCashCoa", "Pisahkan dengan koma")}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Entitas</TableHead>
            {OPENING_FIELDS.map(([k, label]) => (
              <TableHead key={k} className="text-right">
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(a.openings).map(([entity, o]) => (
            <TableRow key={entity}>
              <TableCell className="font-medium">{entity}</TableCell>
              {OPENING_FIELDS.map(([k, label]) => (
                <TableCell key={k}>
                  <Input
                    aria-label={`${label} ${entity}`}
                    inputMode="decimal"
                    className="tabular h-8 min-w-36 text-right"
                    disabled={!editable}
                    value={o[k]}
                    aria-invalid={plain(o[k]) === null}
                    onChange={(e) => setA((cur) => ({ ...cur, openings: { ...cur.openings, [entity]: { ...cur.openings[entity]!, [k]: e.target.value } } }))}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editable ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          <Button type="button" disabled={!save || pending} onClick={() => save && startTransition(async () => setMessage(await onSave(save)))}>
            Simpan asumsi
          </Button>
        </div>
      ) : null}
    </div>
  );
}
