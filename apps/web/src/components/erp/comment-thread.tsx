"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** One comment, serialisable to the client. */
export interface ThreadComment {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  /** ISO timestamp */
  at: string;
}

type Result = { ok: boolean; message: string };

const WHEN = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/**
 * Discussion on one line, oldest first. Asking a question never moves the line: returns and
 * clarifications stay in the approval flow.
 */
export function CommentThread({
  comments,
  canPost,
  closedReason,
  onPost,
}: {
  comments: ThreadComment[];
  canPost: boolean;
  /** Shown instead of the form when this position cannot post. */
  closedReason?: string;
  onPost: (body: string) => Promise<Result>;
}) {
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const r = await onPost(body.trim());
      setMessage(r);
      if (r.ok) setBody("");
    });

  return (
    <div className="grid gap-4">
      {comments.length ? (
        <ol aria-label="Daftar komentar" className="grid gap-3">
          {comments.map((c) => (
            <li key={c.id} className="bg-muted/40 rounded-md px-3 py-2">
              <div className="text-muted-foreground text-xs">
                <span className="text-foreground font-medium">{c.authorName}</span> ({c.authorRole}) · {WHEN.format(new Date(c.at))}
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">Belum ada komentar.</p>
      )}

      {canPost ? (
        <div className="grid gap-2 sm:max-w-xl">
          <Label htmlFor="comment-body">Komentar</Label>
          <textarea
            id="comment-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tanya atau jawab tentang baris ini. Status baris tidak berubah."
            className="border-input focus-visible:ring-ring/50 rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" disabled={pending || !body.trim()} onClick={send}>
              Kirim komentar
            </Button>
            {message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          </div>
        </div>
      ) : closedReason ? (
        <p className="text-muted-foreground text-sm">{closedReason}</p>
      ) : null}
    </div>
  );
}
