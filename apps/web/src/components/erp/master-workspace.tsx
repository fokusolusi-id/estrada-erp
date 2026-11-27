import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { Card, CardContent } from "@/components/ui/card";

const TABS = [
  { href: "/master/customer", label: "Customer" },
  { href: "/master/mitra", label: "Mitra" },
  { href: "/master/produk", label: "Produk Mitra" },
  { href: "/master/karyawan", label: "Karyawan" },
] as const;

/** The Master Data area (SCR-MD-01): one tab per master, and whose it is to change. */
export function MasterWorkspace({
  active,
  employees,
  steward,
  children,
}: {
  active: (typeof TABS)[number]["href"];
  /** Whether the user may open Karyawan. */
  employees: boolean;
  steward: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader title="Master Data" description={steward} />
      <nav aria-label="Master" className="flex flex-wrap gap-1 border-b">
        {TABS.filter((t) => employees || t.href !== "/master/karyawan").map((t) => (
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
