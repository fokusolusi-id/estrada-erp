"use client";

import { useState, useTransition } from "react";
import type { Category } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface CoaOption {
  code: string;
  name: string;
  category: Category;
  active: boolean;
  provisional: boolean;
  /** Lines in the open version that use this code. */
  lines: number;
}

type Result = { ok: boolean; message: string };

const SELECT =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/**
 * Codes the workbook used but COA Master lacked. Finance either confirms one as a real account or moves its
 * lines onto an existing code of the same category.
 */
export function ProvisionalCoa({
  accounts,
  onConfirm,
  onRemap,
}: {
  accounts: CoaOption[];
  onConfirm: (code: string) => Promise<Result>;
  onRemap: (source: string, target: string) => Promise<Result>;
}) {
  const [target, setTarget] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const provisional = accounts.filter((a) => a.provisional);
  const run = (fn: () => Promise<Result>) => startTransition(async () => setMessage(await fn()));

  if (!provisional.length) return <p className="text-muted-foreground text-sm">Tidak ada kode sementara.</p>;

  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kode</TableHead>
            <TableHead>Nama</TableHead>
            <TableHead>Kategori</TableHead>
            <TableHead className="text-right">Baris</TableHead>
            <TableHead>Keputusan Finance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {provisional.map((a) => {
            const targets = accounts.filter((t) => t.active && !t.provisional && t.category === a.category && t.code !== a.code);
            return (
              <TableRow key={a.code} data-testid={`provisional-${a.code}`}>
                <TableCell className="font-medium">{a.code}</TableCell>
                <TableCell className="whitespace-normal">{a.name}</TableCell>
                <TableCell>{a.category}</TableCell>
                <TableCell className="text-right">{a.lines}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => onConfirm(a.code))}>
                      Konfirmasi
                    </Button>
                    <span className="text-muted-foreground text-xs">atau</span>
                    <select
                      aria-label={`Pindahkan ${a.code} ke`}
                      className={SELECT}
                      value={target[a.code] ?? ""}
                      onChange={(e) => setTarget((t) => ({ ...t, [a.code]: e.target.value }))}
                    >
                      <option value="">{targets.length ? "Pilih kode tujuan" : "Tidak ada kode sekategori"}</option>
                      {targets.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.code} · {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || !target[a.code]}
                      onClick={() => run(() => onRemap(a.code, target[a.code]!))}
                    >
                      Pindahkan
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
    </div>
  );
}
