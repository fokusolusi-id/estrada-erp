import { cn } from "@/lib/utils";

/** The colour each entitas keeps in every table and chart. A code that is not an entitas (a division, say) has none. */
const ENTITY_COLOUR: Record<string, string> = {
  ESTRADA: "bg-entity-estrada",
  MATRIK: "bg-entity-matrik",
  DJALU: "bg-entity-djalu",
  PAS: "bg-entity-pas",
};

/** An entitas name with its colour dot. Anything else renders as plain text, so one table can list entitas or divisions. */
export function EntityMark({ code, className }: { code: string; className?: string }) {
  const colour = ENTITY_COLOUR[code.toUpperCase()];
  if (!colour) return <>{code}</>;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", colour)} />
      {code}
    </span>
  );
}
