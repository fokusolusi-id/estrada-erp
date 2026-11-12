import type { Role } from "@estrada/domain";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[] | "all";
  icon: string;
  /** Menu section; items without one sit at the top. */
  group?: "Anggaran" | "Pembayaran" | "Laporan" | "Data" | "Admin" | "Bantuan";
  /** Also shown to these roles when the user's unit sits within `unit` (BCD's people for Pipeline). */
  alsoIn?: { unit: string; roles: readonly Role[] };
  phase?: number;
}

/** Navigation filtered by role. Items marked with a phase are placeholders until that phase ships. */
export const NAV: readonly NavItem[] = [
  { href: "/", icon: "home", label: "Beranda", roles: "all" },
  { href: "/rka", icon: "file", label: "RKA Saya", roles: ["requestor", "default_owner"], group: "Anggaran" },
  { href: "/rka/queue", icon: "inbox", label: "Antrean Konsolidasi", roles: ["default_owner"], group: "Anggaran" },
  { href: "/rka/division", icon: "layers", label: "RKA Divisi", roles: ["division_owner"], group: "Anggaran" },
  { href: "/rka/review", icon: "kanban", label: "Status Board Finance", roles: ["finance"], group: "Anggaran" },
  { href: "/rka/lock", icon: "lock", label: "Kunci RKA", roles: ["finance", "director"], group: "Anggaran" },
  { href: "/rka/cycle", icon: "cycle", label: "Siklus RKA", roles: ["finance", "director"], group: "Anggaran" },
  { href: "/pembayaran", icon: "pay", label: "Permintaan Pembayaran", roles: ["requestor", "default_owner", "division_owner", "finance", "bfp", "cash_manager", "director", "auditor"], group: "Pembayaran" },
  { href: "/pembayaran/rekap", icon: "recap", label: "Rekap Pembayaran", roles: ["finance", "bfp", "cash_manager", "director", "auditor"], group: "Pembayaran" },
  { href: "/pembayaran/rekening", icon: "bank", label: "Rekening Bank", roles: ["cash_manager", "admin"], group: "Pembayaran" },
  { href: "/summary", icon: "chart", label: "Management Summary", roles: ["division_owner", "finance", "director", "auditor"], group: "Laporan" },
  { href: "/pipeline", icon: "pipeline", label: "Pipeline", roles: ["finance", "director", "auditor"], alsoIn: { unit: "BCD", roles: ["requestor", "default_owner", "division_owner"] }, group: "Laporan" },
  { href: "/cash", icon: "wallet", label: "Arus Kas", roles: ["finance", "director", "auditor"], group: "Laporan" },
  { href: "/rka/actual", icon: "actual", label: "Realisasi", roles: ["finance"], group: "Data" },
  { href: "/rka/allocation", icon: "split", label: "Biaya Bersama", roles: ["finance"], group: "Data" },
  { href: "/coa", icon: "book", label: "COA Master", roles: ["finance"], group: "Data" },
  { href: "/admin/users", icon: "users", label: "Pengguna", roles: ["admin"], group: "Admin" },
  { href: "/admin/master", icon: "layers", label: "Unit & Entitas", roles: ["admin"], group: "Admin" },
  { href: "/admin/positions", icon: "seat", label: "Struktur Organisasi", roles: ["admin"], group: "Admin" },
  { href: "/panduan", icon: "help", label: "Panduan", roles: "all", group: "Bantuan" },
];

/** `within(unit)` says whether the user's unit sits within `unit`; without it, unit-based items stay hidden. */
export function navFor(role: Role, within: (unit: string) => boolean = () => false): NavItem[] {
  return NAV.filter((n) => n.roles === "all" || n.roles.includes(role) || (n.alsoIn?.roles.includes(role) && within(n.alsoIn.unit)));
}
