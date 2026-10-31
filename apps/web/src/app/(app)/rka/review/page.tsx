import type { Metadata } from "next";
import { QueueScreen } from "../queue-screen";

export const metadata: Metadata = { title: "Status Board Finance" };

export default function FinanceReviewPage() {
  return (
    <QueueScreen
      title="Status Board Finance"
      description="RKA divisi yang menunggu review. Minta klarifikasi ke Division Owner dengan catatan, atau finalisasi untuk dikunci."
      roles={["finance"]}
      states={["finance_review"]}
    />
  );
}
