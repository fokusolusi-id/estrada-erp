import type { Metadata } from "next";
import { QueueScreen } from "../queue-screen";

export const metadata: Metadata = { title: "RKA Divisi" };

export default function DivisionPage() {
  return (
    <QueueScreen
      title="RKA Divisi"
      description="RKA departemen yang sudah dikonsolidasi, termasuk permintaan klarifikasi dari Finance. Setujui untuk mengirim ke Finance."
      roles={["division_owner"]}
      states={["division_approval"]}
    />
  );
}
