"use client";

import { useState, useTransition } from "react";
import { PERIOD_ACTION_LABEL, PERIOD_STATUS_LABEL, periodActions, type PeriodAction, type PeriodStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

type Result = { ok: boolean; message: string };

/** A year's months by PT, with the steps the user may take on each. */
export function PeriodBoard({
  year,
  entities,
  periods,
  mayClose,
  mayReopen,
  onChange,
}: {
  year: number;
  entities: readonly string[];
  periods: readonly { entity: string; month: number; status: PeriodStatus; note: string | null }[];
  mayClose: boolean;
  mayReopen: boolean;
  onChange: (entity: string, year: number, month: number, action: PeriodAction, reason: string) => Promise<Result>;
}) {
  const [reopening, setReopening] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (entity: string, month: number, action: PeriodAction, why: string) =>
    startTransition(async () => {
      const r = await onChange(entity, year, month, action, why);
      setMessage(r);
      if (r.ok) setReopening(null);
    });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bulan {year}</TableHead>
            {entities.map((e) => (
              <TableHead key={e}>{e}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {MONTHS.map((label, i) => (
            <TableRow key={label}>
              <TableCell className="font-medium">{label}</TableCell>
              {entities.map((entity) => {
                const month = i + 1;
                const key = `${entity}-${month}`;
                const found = periods.find((p) => p.entity === entity && p.month === month);
                const status = found?.status ?? "open";
                const actions = periodActions(status).filter((a) => (a === "reopen" ? mayReopen : mayClose));
                return (
                  <TableCell key={entity} data-testid={`period-${key}`} className="align-top">
                    <div className="grid justify-items-start gap-1">
                      <Badge variant={status === "closed" ? "default" : status === "closing" ? "secondary" : "outline"}>{PERIOD_STATUS_LABEL[status]}</Badge>
                      {found?.note ? <span className="text-muted-foreground text-xs">{found.note}</span> : null}
                      {reopening === key ? (
                        <div className="grid gap-1">
                          <Input aria-label="Alasan membuka kembali" placeholder="Alasan (wajib)" className="h-8 w-48" value={reason} onChange={(e) => setReason(e.target.value)} />
                          <div className="flex gap-1">
                            <Button type="button" size="sm" disabled={pending || !reason.trim()} onClick={() => run(entity, month, "reopen", reason)}>
                              Konfirmasi
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setReopening(null)}>
                              Batal
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {actions.map((a) => (
                            <Button
                              key={a}
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => {
                                if (a !== "reopen") return run(entity, month, a, "");
                                setReason("");
                                setReopening(key);
                              }}
                            >
                              {PERIOD_ACTION_LABEL[a]}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
