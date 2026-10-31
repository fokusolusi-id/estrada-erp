import type { Metadata } from "next";
import { QueueScreen } from "../queue-screen";

export const metadata: Metadata = { title: "Kunci RKA" };

export default function LockPage() {
  return (
    <QueueScreen
      title="Kunci RKA"
      description="Baris yang sudah difinalisasi Finance. Setelah dikunci, versi tidak dapat diubah; revisi membuka versi baru."
      roles={["finance", "director"]}
      states={["awaiting_lock"]}
    />
  );
}
