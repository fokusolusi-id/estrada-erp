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
    body: (p) => `Item ini sudah menunggu ${p.days ?? "beberapa"} hari.`,
    cta: "Buka item",
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
