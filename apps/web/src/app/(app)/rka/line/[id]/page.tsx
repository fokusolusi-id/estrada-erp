import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@estrada/domain";
import { loadLineDetail } from "@/lib/comments";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";
import { ApprovalTimeline } from "@/components/erp/approval-timeline";
import { BudgetGrid } from "@/components/erp/budget-grid";
import { displayUnit } from "@/lib/display-unit";
import { UnitSwitch } from "@/components/erp/unit-switch";
import { setDisplayUnit } from "@/app/(app)/unit-actions";
import { CommentThread } from "@/components/erp/comment-thread";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addComment } from "./actions";

export const metadata: Metadata = { title: "Diskusi baris RKA" };

export default async function LinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadLineDetail(user, id);
  if (!detail) notFound();
  const { line, version, comments } = detail;

  const [org, unit] = await Promise.all([loadOrg(), displayUnit()]);
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
          {version.name} · {line.requestorUnit}
          {line.requestorUnit !== line.ownerUnit ? ` → ${line.ownerUnit}` : ""} · {line.entity}
        </p>
      </div>
        <UnitSwitch value={unit} onChange={setDisplayUnit} />
      </div>

      <Card>
        <CardContent>
          <BudgetGrid lines={[line]} unit={unit} discussion={false} />
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
