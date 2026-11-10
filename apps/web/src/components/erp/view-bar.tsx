"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building, CalendarRange, ChevronDown, Coins, Network, SlidersHorizontal } from "lucide-react";
import { parseUnit, UNITS, type Unit, type ViewChoices, type ViewFilter } from "@estrada/domain";

const SELECT = "border-input bg-background h-8 w-full min-w-0 rounded-md border px-2 text-sm font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60";

export interface ViewBarProps {
  years: number[];
  year: number | null;
  openYears: number[];
  choices: ViewChoices;
  view: ViewFilter;
  unit: Unit;
  onYear: (year: number) => Promise<void>;
  onView: (kind: "entity" | "division", value: string) => Promise<void>;
  onUnit: (unit: Unit) => Promise<void>;
}

/**
 * Tahun, Entitas, Divisi and Satuan for every screen, kept per viewer. Choices only narrow what the position may see.
 * The header shows one button summing up the view (year, anything narrowed, unit); the settings open in a panel.
 */
export function ViewBar({ years, year, openYears, choices, view, unit, onYear, onView, onUnit }: ViewBarProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  const narrowed = (view.entity ? 1 : 0) + (view.division ? 1 : 0);
  const unitLabel = UNITS.find((u) => u.value === unit)?.label ?? "";
  const summary = [view.entity, view.division, unitLabel].filter(Boolean).join(" · ");

  // The panel closes on a click outside it or Escape; several settings can be changed while it is open.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const field = (icon: React.ReactNode, label: string, control: React.ReactNode) => (
    <label className="grid grid-cols-[1rem_4rem_minmax(0,1fr)] items-center gap-2">
      <span aria-hidden className="text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="text-muted-foreground text-xs">{label}</span>
      {control}
    </label>
  );
  const fixed = (text: string) => <span className="h-8 content-center px-2 text-sm font-medium">{text}</span>;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        className={`hover:bg-accent flex h-8 max-w-[22rem] items-center gap-1.5 rounded-md border px-2 text-sm ${narrowed ? "border-primary/40 bg-primary/5" : "border-input"}`}
        aria-expanded={open}
        aria-controls="view-bar"
        aria-label="Tampilan: tahun, entitas, divisi dan satuan"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersHorizontal aria-hidden className="text-muted-foreground size-4 shrink-0" />
        {year !== null ? <span className="font-medium">RKA {year}</span> : null}
        <span className="text-muted-foreground hidden truncate md:inline">· {summary}</span>
        {narrowed ? <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs md:hidden">{narrowed}</span> : null}
        <ChevronDown aria-hidden className="text-muted-foreground size-3.5 shrink-0" />
      </button>
      <div
        id="view-bar"
        className={`${open ? "grid" : "hidden"} bg-popover fixed inset-x-2 top-14 z-40 gap-3 rounded-lg border p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-80`}
      >
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">Tampilan</p>
          <p className="text-muted-foreground text-xs">Berlaku untuk semua layar dan diingat untuk Anda.</p>
        </div>
        {year !== null
          ? field(
              <CalendarRange />,
              "Tahun",
              <select aria-label="Tahun anggaran" className={SELECT} value={year} disabled={pending} onChange={(e) => run(() => onYear(Number(e.target.value)))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    RKA {y}
                    {openYears.includes(y) ? "" : " (terkunci)"}
                  </option>
                ))}
              </select>,
            )
          : null}
        {choices.entities.length
          ? field(
              <Building />,
              "Entitas",
              choices.entities.length === 1 ? (
                fixed(choices.entities[0]!)
              ) : (
                <select aria-label="Entitas" className={SELECT} value={view.entity ?? ""} disabled={pending} onChange={(e) => run(() => onView("entity", e.target.value))}>
                  <option value="">Semua entitas</option>
                  {choices.entities.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              ),
            )
          : null}
        {choices.divisions.length
          ? field(
              <Network />,
              "Divisi",
              choices.divisions.length === 1 ? (
                fixed(choices.divisions[0]!)
              ) : (
                <select aria-label="Divisi" className={SELECT} value={view.division ?? ""} disabled={pending} onChange={(e) => run(() => onView("division", e.target.value))}>
                  <option value="">Semua divisi</option>
                  {choices.divisions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ),
            )
          : null}
        {field(
          <Coins />,
          "Satuan",
          <select aria-label="Satuan" className={SELECT} value={unit} disabled={pending} onChange={(e) => run(() => onUnit(parseUnit(e.target.value)))}>
            {UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>,
        )}
      </div>
    </div>
  );
}
