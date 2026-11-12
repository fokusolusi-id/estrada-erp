import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { can, canViewPayment, formatIdr, money, sum, type Money } from "@estrada/domain";
import { asLike, paymentRealisasi } from "@/lib/payment";
import { PaymentStatusBadge } from "@/components/erp/payment-status";
import { loadLineDetail } from "@/lib/comments";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { ApprovalTimeline } from "@/components/erp/approval-timeline";
import { BudgetGrid } from "@/components/erp/budget-grid";
import { displayUnit } from "@/lib/display-unit";
import { CommentThread } from "@/components/erp/comment-thread";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addComment } from "./actions";
import { rkaLabel } from "@estrada/domain";

export const metadata: Metadata = { title: "Diskusi baris RKA" };

export default async function LinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadLineDetail(user, id);
  if (!detail) notFound();
  const { line, version, comments } = detail;

  const [org, unit, used, requests] = await Promise.all([
    loadOrg(),
    displayUnit(),
    paymentRealisasi([line.id], version.fiscalYear),
    db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.budgetLineId, line.id)).orderBy(asc(schema.paymentRequest.submittedAt)),
  ]);
  const realisasi = used.get(line.id);
  const outsideYear = realisasi && !realisasi.outsideYear.isZero() ? realisasi.outsideYear : null;
  const visibleRequests = requests.filter((r) => r.number && canViewPayment(user.actor, asLike(r), org));
  const res = { requestorUnit: line.requestorUnit, ownerUnit: line.ownerUnit, entity: line.entity, state: line.state };
  const canPost = version.status === "open" && can(user.actor, "line.comment", res, org);
  const closedReason =
    version.status !== "open" || line.state === "locked"
      ? "Baris sudah dikunci; diskusi ditutup."
      : "Anda dapat membaca diskusi ini, tetapi tidak ikut berkomentar.";
  const post = async (body: string) => {
    "use server";
    return addComment(id, body);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/rka" className="text-muted-foreground text-sm hover:underline">
          ← RKA
        </Link>
        <h1 className="text-2xl font-semibold">
          {line.coaCode} {line.item ?? line.coaName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {rkaLabel(version)} · {line.requestorUnit}
          {line.requestorUnit !== line.ownerUnit ? ` → ${line.ownerUnit}` : ""} · {line.entity}
        </p>
      </div>
      </div>

      <Card>
        <CardContent>
          <BudgetGrid lines={[line]} priorYear={version.fiscalYear - 1} unit={unit} discussion={false} />
          {line.basis || line.flags?.length ? (
            <div className="mt-3 grid gap-1 text-sm">
              {line.basis ? (
                <p>
                  <span className="text-muted-foreground">Dasar perhitungan:</span> {line.basis}
                </p>
              ) : null}
              {line.flags?.map((f) => (
                <p key={f} className="bg-warning/15 rounded px-1.5 py-0.5 text-xs">
                  {f}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {realisasi ? (
        <Card data-testid="line-realisasi">
          <CardHeader>
            <CardTitle>Realisasi {version.fiscalYear} dari pembayaran</CardTitle>
            <CardDescription>Permintaan Pembayaran yang Paid tercatat sebesar DPP; yang sudah disetujui atasan tetapi belum dibayar terhitung sedang berjalan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-4 sm:grid-cols-4">
              {(
                [
                  ["Rencana", sum(line.months)],
                  ["Realisasi", realisasi.paid],
                  ["Sedang berjalan", realisasi.committed],
                  ["Sisa", sum(line.months).minus(realisasi.paid).minus(realisasi.committed)],
                ] as [string, Money][]
              ).map(([label, value]) => (
                <div key={label} className="grid gap-0.5">
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className={`tabular text-sm font-medium ${value.isNegative() ? "text-destructive" : ""}`}>{formatIdr(value)}</dd>
                </div>
              ))}
            </dl>
            {outsideYear ? (
              <p className="text-muted-foreground text-xs">Dibayar di luar tahun {version.fiscalYear} (tidak dihitung sebagai realisasi tahun ini): {formatIdr(outsideYear)}.</p>
            ) : null}
            {visibleRequests.length ? (
              <ul className="divide-border divide-y rounded-md border text-sm" aria-label="Permintaan Pembayaran untuk baris ini">
                {visibleRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <Link href={`/pembayaran/${r.id}`} className="text-primary font-mono text-xs hover:underline">
                      {r.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{r.description}</span>
                    <span className="tabular">{formatIdr(money(r.gross))}</span>
                    <PaymentStatusBadge state={r.state} />
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Diskusi</CardTitle>
            <CardDescription>Pertanyaan dan jawaban tentang baris ini. Status baris tidak berubah; untuk mengembalikan, gunakan antrean.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommentThread comments={comments} canPost={canPost} {...(canPost ? {} : { closedReason })} onPost={post} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Riwayat</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalTimeline events={line.history} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
