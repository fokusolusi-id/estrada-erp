import type { Metadata } from "next";
import { QueueScreen } from "../queue-screen";

export const metadata: Metadata = { title: "Antrean Konsolidasi" };

export default function ConsolidationQueuePage() {
  return (
    <QueueScreen
      title="Antrean Konsolidasi"
      description="Usulan dari Requestor yang dianggarkan di unit Anda. Kembalikan dengan catatan bila perlu, lalu kirim ke Division Owner."
      roles={["default_owner"]}
      states={["consolidation"]}
    />
  );
}
