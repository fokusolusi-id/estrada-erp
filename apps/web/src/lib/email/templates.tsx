import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text, render } from "@react-email/components";
import type { EmailTemplate } from "@estrada/domain";

interface Copy {
  subject: string;
  heading: string;
  body: (p: Record<string, string>) => string;
  cta: string;
}

/** Bahasa Indonesia first. No rupiah figures in any email: the link requires login. */
export const COPY: Record<EmailTemplate, Copy> = {
  invitation: {
    subject: "Undangan ke ERP Estrada",
    heading: "Anda diundang ke ERP Estrada",
    body: () => "Akun Anda sudah dibuat oleh Admin. Buat kata sandi untuk mulai menggunakan aplikasi. Tautan berlaku 24 jam.",
    cta: "Buat kata sandi",
  },
  password_reset: {
    subject: "Atur ulang kata sandi ERP Estrada",
    heading: "Atur ulang kata sandi",
    body: () => "Kami menerima permintaan atur ulang kata sandi. Abaikan email ini jika Anda tidak memintanya.",
    cta: "Atur ulang kata sandi",
  },
  cycle_opened: {
    subject: "Siklus RKA dibuka",
    heading: "Siklus RKA sudah dibuka",
    body: (p) => `Silakan isi usulan anggaran unit Anda sebelum ${p.deadline ?? "batas waktu"}.`,
    cta: "Isi RKA",
  },
  lines_submitted: {
    subject: "Usulan RKA menunggu konsolidasi",
    heading: "Usulan baru menunggu Anda",
    body: (p) => `${p.unit ?? "Unit"} mengirim ${p.count ?? "beberapa"} baris usulan untuk dikonsolidasi.`,
    cta: "Buka antrean",
  },
  division_ready: {
    subject: "RKA departemen siap disetujui",
    heading: "RKA siap disetujui",
    body: (p) => `RKA ${p.unit ?? "departemen"} sudah dikonsolidasi dan menunggu persetujuan divisi.`,
    cta: "Tinjau RKA divisi",
  },
  finance_review: {
    subject: "RKA divisi siap direview Finance",
    heading: "RKA divisi menunggu review",
    body: (p) => `RKA ${p.unit ?? "divisi"} sudah disetujui dan siap direview Finance.`,
    cta: "Buka status board",
  },
  ready_to_lock: {
    subject: "Versi RKA siap dikunci",
    heading: "Versi final siap dikunci",
    body: (p) => `Finance sudah memfinalisasi ${p.version ?? "RKA"}. Mohon tinjau dan kunci versi ini.`,
    cta: "Buka Management Summary",
  },
  rka_locked: {
    subject: "RKA sudah dikunci",
    heading: "RKA sudah final",
    body: (p) => `${p.version ?? "RKA"} sudah dikunci dan menjadi baseline anggaran.`,
    cta: "Lihat ringkasan",
  },
  seat_vacant: {
    subject: "Posisi kosong: RKA menunggu pjs",
    heading: "Ada RKA yang tidak bisa diproses",
    body: (p) =>
      `${p.count ?? "Beberapa"} baris RKA milik ${p.unit ?? "unit"} menunggu ${p.role ?? "pemegang posisi"}, tetapi posisi itu kosong. Tetapkan pejabat sementara (pjs) agar alur persetujuan berlanjut.`,
    cta: "Tetapkan pjs",
  },
  line_comment: {
    subject: "Komentar baru di RKA",
    heading: "Ada pertanyaan di baris RKA",
    // The comment itself stays in the app: it may quote figures, and emails never carry rupiah.
    body: (p) => `${p.author ?? "Seseorang"} (${p.role ?? ""}) menulis komentar pada ${p.line ?? "baris RKA"}. Buka diskusi untuk membaca dan membalas.`,
    cta: "Buka diskusi",
  },
  returned: {
    subject: "Usulan RKA dikembalikan",
    heading: "Usulan Anda dikembalikan",
    body: (p) => `Catatan dari reviewer: "${p.comment ?? ""}"`,
    cta: "Perbaiki usulan",
  },
  clarification: {
    subject: "Finance meminta klarifikasi RKA",
    heading: "Klarifikasi diminta",
    body: (p) => `Catatan dari Finance: "${p.comment ?? ""}"`,
    cta: "Beri klarifikasi",
  },
  reminder_pending: {
    subject: "Pengingat: item RKA menunggu Anda",
    heading: "Ada item yang menunggu",
    body: (p) => `${p.count ?? "Beberapa"} baris RKA ${p.unit ?? ""} sudah menunggu tindakan Anda ${p.days ?? "beberapa"} hari atau lebih.`,
    cta: "Buka item",
  },
  payment_submitted: {
    subject: "Permintaan Pembayaran menunggu persetujuan Anda",
    heading: "Permintaan Pembayaran baru",
    body: (p) => `${p.requester ?? "Staf"} mengirim Permintaan Pembayaran ${p.number ?? ""} (${p.entity ?? ""}) untuk Anda setujui.`,
    cta: "Buka permintaan",
  },
  payment_review: {
    subject: "Permintaan Pembayaran perlu diperiksa",
    heading: "Pemeriksaan BFP",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} (${p.entity ?? ""}) dari ${p.requester ?? "staf"} sudah disetujui atasan dan menunggu pemeriksaan Anda.`,
    cta: "Periksa permintaan",
  },
  payment_approval: {
    subject: "Permintaan Pembayaran menunggu persetujuan Head Divisi",
    heading: "Persetujuan Head Divisi",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} (${p.entity ?? ""}) dari ${p.requester ?? "staf"} sudah diperiksa BFP dan menunggu persetujuan Anda.`,
    cta: "Buka permintaan",
  },
  payment_approved: {
    subject: "Permintaan Pembayaran siap dijadwalkan",
    heading: "Siap dijadwalkan",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} (${p.entity ?? ""}) sudah disetujui. Jadwalkan pembayaran dan pilih bank asal.`,
    cta: "Jadwalkan",
  },
  payment_scheduled: {
    subject: "Permintaan Pembayaran sudah dijadwalkan",
    heading: "Pembayaran dijadwalkan",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} dijadwalkan dibayar pada ${p.date ?? "tanggal yang ditetapkan"}.`,
    cta: "Lihat permintaan",
  },
  payment_paid: {
    subject: "Pembayaran sudah dilakukan",
    heading: "Pembayaran berhasil",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} sudah dibayar pada ${p.date ?? ""}. Bukti bayar ada di aplikasi.`,
    cta: "Lihat bukti bayar",
  },
  project_team: {
    subject: "Anda ditetapkan di tim proyek",
    heading: "Penugasan proyek",
    body: (p) => `Anda ditetapkan sebagai ${p.role ?? "anggota tim"} pada proyek ${p.project ?? ""} (${p.entity ?? ""}).`,
    cta: "Buka proyek",
  },
  project_rfs_approval: {
    subject: "RFS proyek menunggu pengesahan",
    heading: "Pengesahan RFS",
    body: (p) => `Project Manager menyatakan proyek ${p.project ?? ""} (${p.entity ?? ""}) siap dilayani (RFS). Sahkan pernyataan itu.`,
    cta: "Buka proyek",
  },
  project_bast_approval: {
    subject: "BAST proyek menunggu pengesahan",
    heading: "Pengesahan BAST",
    body: (p) => `BAST proyek ${p.project ?? ""} (${p.entity ?? ""}) sudah disiapkan Project Admin dan menunggu pengesahan Anda.`,
    cta: "Buka proyek",
  },
  project_bast_approved: {
    subject: "BAST proyek disahkan",
    heading: "BAST disahkan",
    body: (p) => `BAST proyek ${p.project ?? ""} (${p.entity ?? ""}) sudah disahkan. Penagihan dan serah terima ke MSO dapat dimulai.`,
    cta: "Buka proyek",
  },
  project_handover_submitted: {
    subject: "Paket serah terima menunggu penilaian",
    heading: "Penilaian serah terima",
    body: (p) => `PMO mengajukan paket serah terima proyek ${p.project ?? ""} (${p.entity ?? ""}). Nilai terhadap lima kriteria penerimaan.`,
    cta: "Buka serah terima",
  },
  project_handover_returned: {
    subject: "Paket serah terima dikembalikan",
    heading: "Paket dikembalikan",
    body: (p) => `Head MSO mengembalikan paket serah terima proyek ${p.project ?? ""}. Catatan: "${p.comment ?? ""}"`,
    cta: "Lengkapi paket",
  },
  project_handover_accepted: {
    subject: "Serah terima diterima MSO",
    heading: "Serah terima diterima MSO",
    body: (p) => `MSO menerima serah terima proyek ${p.project ?? ""} (${p.entity ?? ""}). Lanjutkan checklist operasional dan penerimaan turunan teknis.`,
    cta: "Buka serah terima",
  },
  project_defect_reported: {
    subject: "Dugaan cacat bawaan menunggu penetapan",
    heading: "Penetapan cacat bawaan",
    body: (p) => `Ada gangguan pada masa garansi proyek ${p.project ?? ""} (${p.entity ?? ""}) yang diduga cacat bawaan. Head ISO dan Head PMO menetapkannya bersama.`,
    cta: "Buka garansi",
  },
  project_defect_inherited: {
    subject: "Cacat bawaan proyek menunggu perbaikan",
    heading: "Perbaikan cacat bawaan",
    body: (p) => `Head ISO dan Head PMO menetapkan sebuah gangguan pada proyek ${p.project ?? ""} (${p.entity ?? ""}) sebagai cacat bawaan. Perbaiki dan catat hasilnya.`,
    cta: "Buka garansi",
  },
  payment_returned: {
    subject: "Permintaan Pembayaran dikembalikan",
    heading: "Permintaan Anda dikembalikan",
    body: (p) => `Permintaan Pembayaran ${p.number ?? ""} dikembalikan untuk diperbaiki. Catatan: "${p.comment ?? ""}"`,
    cta: "Perbaiki permintaan",
  },
  deadline_near: {
    subject: "Batas waktu RKA mendekat",
    heading: "Batas waktu mendekat",
    body: (p) => `Tersisa ${p.days ?? "beberapa"} hari untuk mengirim usulan RKA.`,
    cta: "Lanjutkan pengisian",
  },
};

export function EmailLayout({ copy, payload }: { copy: Copy; payload: Record<string, string> }) {
  return (
    <Html lang="id">
      <Head />
      <Preview>{copy.heading}</Preview>
      <Body style={{ backgroundColor: "#f5f5f5", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: 32, borderRadius: 8, maxWidth: 520 }}>
          <Text style={{ color: "#666", fontSize: 12, margin: 0 }}>ERP Estrada</Text>
          <Heading style={{ fontSize: 20 }}>{copy.heading}</Heading>
          {payload.name ? <Text>Halo {payload.name},</Text> : null}
          <Text>{copy.body(payload)}</Text>
          <Section style={{ marginTop: 24 }}>
            <Button
              href={payload.url ?? "#"}
              style={{ backgroundColor: "#1e4f9c", color: "#fff", padding: "10px 18px", borderRadius: 6 }}
            >
              {copy.cta}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderEmail(template: EmailTemplate, payload: Record<string, string>) {
  const copy = COPY[template];
  const html = await render(<EmailLayout copy={copy} payload={payload} />);
  return { subject: copy.subject, html };
}
