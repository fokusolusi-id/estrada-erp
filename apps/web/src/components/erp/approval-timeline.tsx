import type { ApprovalAction, ApprovalState } from "@estrada/domain";
import { STATE_LABEL } from "./status-badge";

/** One approval event, serialisable to the client. */
export interface TimelineEvent {
  action: ApprovalAction;
  fromState: ApprovalState;
  toState: ApprovalState;
  actorName: string;
  actorRole: string;
  comment: string | null;
  /** ISO timestamp */
  at: string;
}

export interface Remark {
  by: string;
  comment: string;
}

const DONE: Record<ApprovalAction, string> = {
  submit: "Dikirim ke Default Owner",
  return: "Dikembalikan",
  consolidate: "Dikonsolidasi",
  approve: "Disetujui divisi",
  clarify: "Klarifikasi diminta",
  finalize: "Difinalisasi",
  lock: "Dikunci",
};

const WHEN = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Who moved a line, when and why, newest first. */
export function ApprovalTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-muted-foreground text-xs">Belum ada riwayat.</p>;
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="grid gap-2 border-l pl-3 text-xs">
      {sorted.map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <div>
            <span className="font-medium">{DONE[e.action]}</span>
            <span className="text-muted-foreground">
              {" "}
              · {STATE_LABEL[e.fromState]} → {STATE_LABEL[e.toState]}
            </span>
          </div>
          <div className="text-muted-foreground">
            {e.actorName} ({e.actorRole}) · {WHEN.format(new Date(e.at))}
          </div>
          {e.comment ? <p className="mt-0.5">“{e.comment}”</p> : null}
        </li>
      ))}
    </ol>
  );
}
