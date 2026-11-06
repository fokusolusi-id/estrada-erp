import {
  BookOpen, ChartColumn, CircleDot, FileText, Gauge, House, Inbox, Layers, Lock, RefreshCw, Split, Users, Wallet, Kanban, Armchair, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: House, file: FileText, inbox: Inbox, layers: Layers, kanban: Kanban, lock: Lock, cycle: RefreshCw, actual: Gauge,
  split: Split, book: BookOpen, chart: ChartColumn, pipeline: CircleDot, wallet: Wallet, users: Users, seat: Armchair,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? CircleDot;
  return <Icon aria-hidden className={className ?? "size-4 shrink-0"} />;
}
