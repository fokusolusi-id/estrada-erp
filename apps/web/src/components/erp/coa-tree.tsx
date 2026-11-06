"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { coaTree, type Category } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface CoaTreeAccount {
  code: string;
  name: string;
  category: Category;
  parentCode: string | null;
  defaultOwnerUnit: string | null;
  active: boolean;
  provisional: boolean;
  /** Lines in the open version that use this code. */
  lines: number;
}

const CATEGORIES: readonly Category[] = ["Revenue", "COGS", "OPEX", "OTHERS", "CAPEX"];
const INDENT = 20;

/** COA Master as a tree: grouped by category, children under their parent, each branch folding open or shut. */
export function CoaTree({ accounts }: { accounts: CoaTreeAccount[] }) {
  const ordered = coaTree(accounts);
  const parentOf = new Map(ordered.map(({ account }) => [account.code, ordered.some((o) => o.account.code === account.parentCode) ? account.parentCode : null]));
  const hasChildren = new Set([...parentOf.values()].filter((p): p is string => !!p));
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const ancestors = (code: string) => {
    const out: string[] = [];
    for (let p = parentOf.get(code); p; p = parentOf.get(p)) out.push(p);
    return out;
  };
  const q = query.trim().toLowerCase();
  const matches = q ? new Set(ordered.filter(({ account: a }) => `${a.code} ${a.name}`.toLowerCase().includes(q)).flatMap(({ account: a }) => [a.code, ...ancestors(a.code)])) : null;
  const visible = (code: string, category: Category) =>
    matches ? matches.has(code) : !closed.has(category) && !ancestors(code).some((p) => closed.has(p));
  const toggle = (key: string) =>
    setClosed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input aria-label="Cari COA" placeholder="Cari kode atau nama" className="h-8 max-w-xs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setClosed(new Set())}>
            <ChevronsUpDown aria-hidden /> Buka semua
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setClosed(new Set(hasChildren))}>
            <ChevronsDownUp aria-hidden /> Tutup semua
          </Button>
        </div>
      </div>
      <Table role="treegrid" aria-label="Pohon COA">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-64">Kode & nama</TableHead>
            <TableHead>Default owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Baris</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {CATEGORIES.flatMap((category) => {
            const rows = ordered.filter(({ account }) => account.category === category);
            if (!rows.length) return [];
            const open = matches ? true : !closed.has(category);
            return [
              <TableRow key={category} data-testid={`group-${category}`} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={4} className="py-1.5">
                  <button
                    type="button"
                    aria-label={`${open ? "Tutup" : "Buka"} ${category}`}
                    aria-expanded={open}
                    className="flex items-center gap-1.5 text-sm font-semibold"
                    onClick={() => toggle(category)}
                  >
                    {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                    {category}
                    <span className="text-muted-foreground font-normal">· {rows.length} kode</span>
                  </button>
                </TableCell>
              </TableRow>,
              ...rows
                .filter(({ account }) => visible(account.code, category))
                .map(({ account: a, depth }) => {
                  const branch = hasChildren.has(a.code);
                  const expanded = matches ? true : !closed.has(a.code);
                  return (
                    <TableRow key={a.code} data-code={a.code} aria-level={depth + 1} aria-expanded={branch ? expanded : undefined}>
                      <TableCell className="py-1">
                        <div className="flex items-stretch">
                          {Array.from({ length: depth }, (_, i) => (
                            <span key={i} aria-hidden className="border-border shrink-0 border-l" style={{ width: INDENT, marginLeft: i === 0 ? 9 : 0 }} />
                          ))}
                          <span className="flex size-6 shrink-0 items-center justify-center">
                            {branch ? (
                              <button
                                type="button"
                                aria-label={`${expanded ? "Tutup" : "Buka"} ${a.code}`}
                                className="hover:bg-accent text-muted-foreground rounded p-0.5"
                                onClick={() => toggle(a.code)}
                              >
                                {expanded ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                              </button>
                            ) : (
                              <span aria-hidden className="bg-border size-1.5 rounded-full" />
                            )}
                          </span>
                          <span className={cn("ml-1.5 flex items-baseline gap-2 py-0.5 whitespace-normal", branch && "font-medium")}>
                            <span className="tabular shrink-0">{a.code}</span>
                            <span className={cn(!branch && "text-muted-foreground")}>{a.name}</span>
                          </span>
                        </div>
                      </TableCell>
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
                      <TableCell className="tabular text-right">{a.lines}</TableCell>
                    </TableRow>
                  );
                }),
            ];
          })}
        </TableBody>
      </Table>
    </div>
  );
}
