import type { EmailTemplate } from "@estrada/domain";

/** What each in-app notification says in the header list. No rupiah, like the emails. */
export const NOTIFICATION_TEXT: Record<EmailTemplate, string> = {
  cycle_opened: "Siklus RKA dibuka: isi usulan unit Anda",
  lines_submitted: "Ada baris RKA masuk untuk dikonsolidasi",
  division_ready: "Baris RKA menunggu persetujuan divisi",
  finance_review: "Baris RKA masuk untuk Review Finance",
  ready_to_lock: "RKA sudah difinalisasi dan menunggu dikunci",
  rka_locked: "RKA dikunci",
  returned: "Usulan RKA dikembalikan: perlu diubah",
  clarification: "Finance meminta klarifikasi RKA",
  reminder_pending: "Pengingat: ada baris RKA menunggu Anda",
  deadline_near: "Batas pengajuan RKA sudah dekat",
  seat_vacant: "Posisi kosong: RKA menunggu pjs",
  line_comment: "Komentar baru di diskusi baris RKA",
  invitation: "Undangan akun",
  password_reset: "Atur ulang kata sandi",
  payment_submitted: "Permintaan Pembayaran menunggu persetujuan Anda",
  payment_review: "Permintaan Pembayaran perlu diperiksa",
  payment_approval: "Permintaan Pembayaran menunggu persetujuan",
  payment_approved: "Permintaan Pembayaran disetujui: jadwalkan pembayaran",
  payment_scheduled: "Permintaan Pembayaran Anda dijadwalkan",
  payment_paid: "Permintaan Pembayaran Anda sudah dibayar",
  payment_returned: "Permintaan Pembayaran dikembalikan: perlu diubah",
};

/** Notifications that ask the reader to change their own data. */
export const NEEDS_CHANGE: ReadonlySet<string> = new Set<EmailTemplate>(["returned", "clarification", "payment_returned"]);
