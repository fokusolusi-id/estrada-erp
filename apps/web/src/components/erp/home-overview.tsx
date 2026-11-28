import Link from "next/link";
import { ROLE_LABEL, type ApprovalAction, type ApprovalState, type PendingStage } from "@estrada/domain";
import { StatusBadge } from "./status-badge";

/** Who is holding the lines that are not final yet, and which divisions to chase. */
export function PendingStages({ pending, hrefFor }: { pending: readonly PendingStage[]; hrefFor?: (state: ApprovalState, division?: string) => string }) {
  if (!pending.length) return <p className="text-muted-foreground text-sm">Semua baris sudah final.</p>;
  return (
    <ul className="divide-y">
      {pending.map((p) => {
        const row = (
          <>
            <StatusBadge state={p.state} />
            <span className="text-muted-foreground min-w-0 flex-1 text-sm">
              di {ROLE_LABEL[p.role]}
              {p.idleDays ? ` · terlama diam ${p.idleDays} hari` : ""}
            </span>
            <span className="tabular text-section whitespace-nowrap">{p.count} baris</span>
          </>
        );
        const layout = "flex items-center gap-3 py-1";
        return (
          <li key={p.state} className="grid gap-1 py-2.5">
            {hrefFor ? (
              <Link href={hrefFor(p.state)} className={`${layout} hover:bg-muted/50 -mx-2 rounded-md px-2`}>
                {row}
              </Link>
            ) : (
              <div className={layout}>{row}</div>
            )}
            <ul className="flex flex-wrap gap-2" aria-label="Per divisi">
              {p.divisions.map((d) => {
                const chip = "tabular inline-flex min-h-8 items-center rounded-md border px-2.5 text-sm";
                return (
                  <li key={d.division}>
                    {hrefFor ? (
                      <Link href={hrefFor(p.state, d.division)} className={`${chip} hover:bg-accent`}>
                        {d.division} {d.count}
                        {d.idleDays ? ` · ${d.idleDays} hr` : ""}
                      </Link>
                    ) : (
                      <span className={chip}>
                        {d.division} {d.count}
                        {d.idleDays ? ` · ${d.idleDays} hr` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** What each handoff is called in the activity list. */
const DID: Record<ApprovalAction, string> = {
  submit: "mengirim ke Default Owner",
  return: "mengembalikan",
  send_back: "mengembalikan ke Default Owner",
  consolidate: "mengirim ke Division Owner",
  approve: "menyetujui ke Finance",
  clarify: "meminta klarifikasi",
  finalize: "memfinalisasi",
  lock: "mengunci",
};
const WHEN = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export interface ActivityGroup {
  actorName: string;
  action: ApprovalAction;
  at: string;
  events: { actorRole: string; lineId: string; coaCode: string; name: string }[];
}

export function ActivityList({ groups }: { groups: readonly ActivityGroup[] }) {
  if (!groups.length) return <p className="text-muted-foreground text-sm">Belum ada aktivitas.</p>;
  return (
    <ol className="divide-y" aria-label="Aktivitas terbaru">
      {groups.map((g, i) => {
        const first = g.events[0]!;
        return (
          <li key={i} className="grid gap-0.5 py-2.5 text-sm first:pt-0 last:pb-0">
            <span>
              <span className="font-medium">{g.actorName}</span> {DID[g.action]}{" "}
              {g.events.length > 1 ? (
                <span className="font-medium">{g.events.length} baris</span>
              ) : (
                <Link href={`/rka/line/${first.lineId}`} className="text-primary hover:underline">
                  {first.coaCode} · {first.name}
                </Link>
              )}
            </span>
            <span className="text-muted-foreground text-xs">
              {first.actorRole} · {WHEN.format(new Date(g.at))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
