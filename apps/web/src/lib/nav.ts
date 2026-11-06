import type { Role } from "@estrada/domain";

export interface NavItem {
  href: string;
  label: string;
  roles: readonly Role[] | "all";
  icon: string;
  phase?: number;
}

/** Navigation filtered by role. Items marked with a phase are placeholders until that phase ships. */
export const NAV: readonly NavItem[] = [
  { href: "/", icon: "home", label: "Beranda", roles: "all" },
  { href: "/rka", icon: "file", label: "RKA Saya", roles: ["requestor", "default_owner"] },
  { href: "/rka/queue", icon: "inbox", label: "Antrean Konsolidasi", roles: ["default_owner"] },
  { href: "/rka/division", icon: "layers", label: "RKA Divisi", roles: ["division_owner"] },
  { href: "/rka/review", icon: "kanban", label: "Status Board Finance", roles: ["finance"] },
  { href: "/rka/lock", icon: "lock", label: "Kunci RKA", roles: ["finance", "director"] },
  { href: "/rka/cycle", icon: "cycle", label: "Siklus RKA", roles: ["finance", "director"] },
  { href: "/rka/actual", icon: "actual", label: "Realisasi 2026", roles: ["finance"] },
  { href: "/rka/allocation", icon: "split", label: "Biaya Bersama", roles: ["finance"] },
  { href: "/coa", icon: "book", label: "COA Master", roles: ["finance"] },
  { href: "/summary", icon: "chart", label: "Management Summary", roles: ["division_owner", "finance", "director", "auditor"] },
  { href: "/pipeline", icon: "pipeline", label: "Pipeline", roles: ["finance", "director", "division_owner"], phase: 2 },
  { href: "/cash", icon: "wallet", label: "Arus Kas", roles: ["finance", "director"], phase: 3 },
  { href: "/admin/users", icon: "users", label: "Pengguna", roles: ["admin"] },
  { href: "/admin/positions", icon: "seat", label: "Posisi & pjs", roles: ["admin"] },

];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles === "all" || n.roles.includes(role));
}
