import { Filter } from "lucide-react";
import { viewSetup } from "@/lib/view-filter";
import { resetView } from "@/app/(app)/view-actions";
import { ResetViewButton } from "./reset-view-button";

const NAME = { entity: "Entitas", division: "Divisi" } as const;

/**
 * Says what the header's Entitas and Divisi are narrowing on this screen, so missing rows never surprise anyone,
 * and which of them this screen does not use.
 */
export async function ViewNote({ ignores = [] }: { ignores?: readonly ("entity" | "division")[] }) {
  const { view } = await viewSetup();
  const applied = (["entity", "division"] as const).filter((k) => view[k] && !ignores.includes(k));
  const skipped = (["entity", "division"] as const).filter((k) => view[k] && ignores.includes(k));
  if (!applied.length && !skipped.length) return null;
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="view-note">
      <Filter aria-hidden className="size-3.5" />
      {applied.length ? (
        <span>
          Filter aktif: {applied.map((k) => `${NAME[k]} ${view[k]}`).join(" · ")}.
        </span>
      ) : null}
      {skipped.length ? <span>{skipped.map((k) => NAME[k]).join(" dan ")} tidak berlaku di layar ini.</span> : null}
      <ResetViewButton onReset={resetView} />
    </p>
  );
}
