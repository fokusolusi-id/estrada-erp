import "server-only";
import { sodConflict, sodFunctions, type Actor, type Role } from "@estrada/domain";
import { WorkflowError } from "./workflow";

export interface HistoryEvent {
  actorUserId: string;
  actorRole: Role;
  /** Null on events recorded before the unit was kept: the role alone is judged then. */
  actorUnit: string | null;
  action: string;
}

/** Sending a record back is not a duty on it, so it neither conflicts nor counts. */
export const SENDS_BACK: readonly string[] = ["return", "send_back", "clarify"];

/** Refuses a step when the matrix forbids it to someone who already took another step on the same record. */
export function assertSeparated(actor: Actor, history: readonly HistoryEvent[]) {
  const conflict = sodConflict(
    { userId: actor.userId, functions: sodFunctions(actor.role, actor.orgUnit) },
    history.filter((e) => !SENDS_BACK.includes(e.action)).map((e) => ({ userId: e.actorUserId, functions: sodFunctions(e.actorRole, e.actorUnit) })),
  );
  if (conflict) {
    throw new WorkflowError(`Pemisahan tugas: Anda sudah bertindak sebagai ${conflict.did} pada data ini, sehingga langkah ${conflict.now} harus dilakukan orang lain (matriks SoD).`);
  }
}
