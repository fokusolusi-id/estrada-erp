import type { ReactNode } from "react";
import { APPROVAL_STATES, daysLeft, type ApprovalState, type VersionStatus } from "@estrada/domain";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { STATE_LABEL } from "./status-badge";
import { rkaLabel } from "@estrada/domain";

export interface VersionRow {
  id: string;
  name: string;
  fiscalYear: number;
  status: VersionStatus;
  deadline: Date | null;
  copiedFrom: string | null;
  byState: Partial<Record<ApprovalState, number>>;
}

const STATUS: Record<VersionStatus, { label: string; tone: string }> = {
  open: { label: "Terbuka", tone: "bg-accent text-accent-foreground" },
  locked: { label: "Terkunci", tone: "bg-success/20 text-foreground" },
  archived: { label: "Diarsipkan", tone: "bg-secondary text-muted-foreground" },
};

const WHEN = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function deadlineText(deadline: Date, now: Date): string {
  const left = daysLeft(deadline, now);
  const tail = left > 0 ? `${left} hari lagi` : left === 0 ? "hari ini" : `lewat ${-left} hari`;
  return `${WHEN.format(deadline)} · ${tail}`;
}

/** RKA versions with their status, deadline and lines per approval state. `actions` renders each row's buttons. */
export function VersionTable({ rows, now = new Date(), actions }: { rows: VersionRow[]; now?: Date; actions?: (row: VersionRow) => ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Versi</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Batas waktu</TableHead>
          <TableHead>Baris</TableHead>
          {actions ? <TableHead /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const total = Object.values(r.byState).reduce((a, n) => a + (n ?? 0), 0);
          const states = APPROVAL_STATES.filter((s) => r.byState[s]).map((s) => `${STATE_LABEL[s]} ${r.byState[s]}`);
          const late = r.deadline && r.status === "open" && daysLeft(r.deadline, now) < 0;
          return (
            <TableRow key={r.id} data-testid={`version-${r.id}`}>
              <TableCell>
                <div className="font-medium">{rkaLabel(r)}</div>
                <div className="text-muted-foreground text-xs">
                  {r.name}
                  {r.copiedFrom ? <> · <span>Revisi dari {r.copiedFrom}</span></> : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={cn("border-transparent", STATUS[r.status].tone)}>{STATUS[r.status].label}</Badge>
              </TableCell>
              <TableCell className={cn(late && "text-destructive")}>{r.deadline ? deadlineText(r.deadline, now) : "—"}</TableCell>
              <TableCell>
                <div>{total} baris</div>
                {states.length ? <div className="text-muted-foreground text-xs">{states.join(" · ")}</div> : null}
              </TableCell>
              {actions ? <TableCell>{actions(r)}</TableCell> : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
