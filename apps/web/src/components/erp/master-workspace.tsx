import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";

const TABS = [
  { href: "/master/customer", label: "Customer" },
  { href: "/master/mitra", label: "Mitra" },
  { href: "/master/produk", label: "Produk Mitra" },
  { href: "/master/karyawan", label: "Karyawan" },
  { href: "/master/cost-center", label: "Cost Center" },
  { href: "/master/periode", label: "Periode" },
  { href: "/master/persetujuan", label: "Persetujuan" },
] as const;

/** The Master Data area (SCR-MD-01): one tab per master, and whose it is to change. */
export function MasterWorkspace({
  active,
  employees,
  requests = false,
  costCenters = false,
  periods = false,
  steward,
  children,
}: {
  active: (typeof TABS)[number]["href"];
  /** Whether the user may open Karyawan. */
  employees: boolean;
  /** Whether the user may open Persetujuan. */
  requests?: boolean;
  /** Whether the user may open Cost Center. */
  costCenters?: boolean;
  /** Whether the user may open Periode. */
  periods?: boolean;
  steward: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Master Data" description={steward} />
      <nav aria-label="Master" className="flex flex-wrap gap-1 border-b">
        {TABS.filter((t) => (employees || t.href !== "/master/karyawan") && (requests || t.href !== "/master/persetujuan") && (costCenters || t.href !== "/master/cost-center") && (periods || t.href !== "/master/periode")).map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.href === active ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
