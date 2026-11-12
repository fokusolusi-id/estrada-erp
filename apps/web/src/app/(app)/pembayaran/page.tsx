import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ReceiptText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { paymentQueue, paymentRows, visiblePayments } from "@/lib/payment";
import { PageHeader } from "@/components/erp/page-header";
import { PaymentTable } from "@/components/erp/payment-table";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Permintaan Pembayaran" };

const TABS = [
  { key: "antrian", label: "Perlu tindakan" },
  { key: "saya", label: "Permintaan saya" },
  { key: "semua", label: "Semua" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser();
  if (user.actor.role === "admin") redirect("/");
  const { tab: wanted } = await searchParams;

  const [queue, visible] = await Promise.all([paymentQueue(user.actor), visiblePayments(user.actor)]);
  const mine = visible.filter((r) => r.requesterId === user.id);
  const tab: Tab = TABS.some((t) => t.key === wanted) ? (wanted as Tab) : queue.length ? "antrian" : "saya";
  const list = tab === "antrian" ? queue : tab === "saya" ? mine : visible;
  const rows = await paymentRows(list);
  const count: Record<Tab, number> = { antrian: queue.length, saya: mine.length, semua: visible.length };
  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground"}`;

  const empty =
    tab === "antrian" ? (
      <EmptyState icon={ReceiptText} title="Tidak ada yang menunggu Anda" description="Permintaan yang perlu Anda setujui, periksa atau bayar muncul di sini." />
    ) : (
      <EmptyState
        icon={ReceiptText}
        title="Belum ada permintaan"
        description="Buat Permintaan Pembayaran untuk tagihan vendor atau Cash Advance, lengkap dengan dokumennya."
        action={
          <Button asChild>
            <Link href="/pembayaran/baru">Buat permintaan</Link>
          </Button>
        }
      />
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        title="Permintaan Pembayaran"
        description="Permohonan dikirim ke atasan, diperiksa BFP, disetujui Head Divisi, lalu dijadwalkan dan dibayar Cash Management."
        actions={
          <Button asChild>
            <Link href="/pembayaran/baru">
              <Plus /> Buat permintaan
            </Link>
          </Button>
        }
      />
      <nav aria-label="Daftar" className="bg-muted flex w-fit flex-wrap gap-1 rounded-lg p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/pembayaran?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={tabClass(tab === t.key)}>
            {t.label}
            <span className="bg-muted-foreground/15 rounded-full px-1.5 text-xs tabular-nums">{count[t.key]}</span>
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent>
          <PaymentTable rows={rows} empty={empty} />
        </CardContent>
      </Card>
    </div>
  );
}
