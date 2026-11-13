"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Result = { ok: boolean; message: string };

export interface AwaitingDeal {
  id: string;
  name: string;
  customer: string;
  entity: string;
  fiscalYear: number;
  /** Whether this user may open a project for the deal's entity. */
  canOpen: boolean;
}

/** Closed Won deals without a project: BCD types the contract's number of sites and opens the project. */
export function ProjectOpen({ deals, onOpen }: { deals: AwaitingDeal[]; onOpen: (dealId: string, contractSites: number) => Promise<Result> }) {
  const [sites, setSites] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<(Result & { id: string }) | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Entitas</TableHead>
          <TableHead>Tahun</TableHead>
          <TableHead className="w-72">Jumlah lokasi kontrak</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((d) => {
          const n = Number(sites[d.id]);
          return (
            <TableRow key={d.id} data-testid={`awaiting-${d.id}`}>
              <TableCell className="font-medium whitespace-normal">{d.name}</TableCell>
              <TableCell>{d.customer}</TableCell>
              <TableCell>{d.entity}</TableCell>
              <TableCell className="tabular">{d.fiscalYear}</TableCell>
              <TableCell>
                {d.canOpen ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      startTransition(async () => setMessage({ id: d.id, ...(await onOpen(d.id, n)) }));
                    }}
                  >
                    <Input
                      aria-label={`Jumlah lokasi kontrak ${d.name}`}
                      type="number"
                      min={1}
                      className="w-24"
                      value={sites[d.id] ?? ""}
                      onChange={(e) => setSites({ ...sites, [d.id]: e.target.value })}
                    />
                    <Button type="submit" size="sm" disabled={pending || !Number.isInteger(n) || n < 1}>
                      Buka proyek
                    </Button>
                    {message?.id === d.id ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
                  </form>
                ) : (
                  <span className="text-muted-foreground text-sm">Dibuka oleh BCD</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
