import {
  BookOpen, ChartColumn, CircleDot, CircleHelp, FileText, Gauge, House, Inbox, Layers, Lock, RefreshCw, Split, Users, Wallet, Kanban, Armchair, ShieldCheck, Landmark, ReceiptText, FileSpreadsheet, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: House, file: FileText, inbox: Inbox, layers: Layers, kanban: Kanban, lock: Lock, cycle: RefreshCw, actual: Gauge,
  split: Split, book: BookOpen, chart: ChartColumn, pipeline: CircleDot, wallet: Wallet, users: Users, seat: Armchair, shield: ShieldCheck, help: CircleHelp, bank: Landmark, pay: ReceiptText, recap: FileSpreadsheet,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CircleDot;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
