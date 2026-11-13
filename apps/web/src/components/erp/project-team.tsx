"use client";

import { useState, useTransition } from "react";
import { teamProblems, type ProjectTeam as Team } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Result = { ok: boolean; message: string };

const SELECT =
  "border-input focus-visible:ring-ring/50 h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60";

const SEATS: { key: keyof Team; label: string; does: string }[] = [
  { key: "pm", label: "Project Manager", does: "Mendaftarkan lokasi, menyusun rencana" },
  { key: "deliveryControl", label: "Delivery Control", does: "Instalasi, uji, mengumpulkan BAI" },
  { key: "projectAdmin", label: "Project Admin", does: "Memperbarui lokasi, mengompilasi BAI" },
];

const PROBLEM = {
  SELF_VERIFICATION_NOT_ALLOWED: "Delivery Control tidak boleh merangkap Project Manager.",
  BAI_MAKER_CHECKER: "Delivery Control tidak boleh merangkap Project Admin.",
};

/** The project's three PMO seats. The Head PMO assigns them; everyone else reads. */
export function ProjectTeam({
  team,
  people,
  canAssign,
  onSave,
}: {
  team: Team;
  people: { id: string; name: string; title: string }[];
  canAssign: boolean;
  onSave: (team: Team) => Promise<Result>;
}) {
  const [draft, setDraft] = useState(team);
  const [message, setMessage] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const problem = teamProblems(draft)[0];
  const changed = SEATS.some((s) => draft[s.key] !== team[s.key]);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? (id ? "Bukan orang PMO lagi" : "Belum ditetapkan");

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => setMessage(await onSave(draft)));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {SEATS.map((s) => (
          <div key={s.key} className="grid gap-1.5" data-testid={`team-${s.key}`}>
            <Label htmlFor={`team-${s.key}`}>{s.label}</Label>
            {canAssign ? (
              <select id={`team-${s.key}`} className={SELECT} value={draft[s.key] ?? ""} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value || null })}>
                <option value="">Belum ditetapkan</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className={draft[s.key] ? "text-sm font-medium" : "text-muted-foreground text-sm"}>{name(draft[s.key])}</p>
            )}
            <p className="text-muted-foreground text-xs">{s.does}</p>
          </div>
        ))}
      </div>
      {canAssign ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {problem ? <p className="text-destructive text-sm">{PROBLEM[problem]}</p> : message ? <p className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}>{message.message}</p> : null}
          <Button type="submit" size="sm" disabled={pending || !changed || !!problem}>
            Simpan tim
          </Button>
        </div>
      ) : null}
    </form>
  );
}
