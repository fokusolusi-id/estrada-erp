import { formatIdr, money, terbilang } from "@estrada/domain";

export interface FormulirSign {
  step: string;
  name: string | null;
  role: string;
  /** Formatted date and time of the approval, or null while it is still open. */
  at: string | null;
}

export interface FormulirData {
  entityName: string;
  entityCode: string;
  number: string;
  kind: string;
  /** Formatted submission date. */
  date: string;
  status: string;
  requester: string;
  requesterUnit: string;
  project: string | null;
  line: string | null;
  description: string;
  payee: string | null;
  payeeAccount: string | null;
  dueOn: string | null;
  gross: string;
  ppn: string;
  pph: string;
  documents: string[];
  bank: string | null;
  scheduledOn: string | null;
  paidOn: string | null;
  signs: FormulirSign[];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="align-top">
      <th scope="row" className="w-44 py-1 pr-3 text-left font-normal text-neutral-500">
        {label}
      </th>
      <td className="py-1">{children || "–"}</td>
    </tr>
  );
}

/**
 * Formulir Permohonan Pembayaran, for printing or saving as PDF. Approvals are electronic: each box shows who approved
 * from which seat and when, taken from the request's history.
 */
export function PaymentFormulir({ d }: { d: FormulirData }) {
  const gross = money(d.gross);
  const ppn = money(d.ppn);
  const pph = money(d.pph);
  const nett = gross.plus(ppn).minus(pph);
  return (
    <article className="mx-auto grid max-w-[190mm] gap-5 bg-white p-8 text-[13px] leading-snug text-neutral-900 print:p-0" data-testid="formulir">
      <header className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-3">
        <div>
          <p className="text-base font-bold">{d.entityName}</p>
          <p className="text-neutral-500">{d.entityCode}</p>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-bold tracking-wide">FORMULIR PERMOHONAN PEMBAYARAN</h1>
          <p className="font-mono">{d.number}</p>
          <p className="text-neutral-500">
            {d.date} · {d.status}
          </p>
        </div>
      </header>

      <table className="w-full">
        <tbody>
          <Row label="Jenis">{d.kind}</Row>
          <Row label="Pemohon">
            {d.requester} ({d.requesterUnit})
          </Row>
          <Row label="Proyek / perusahaan">{d.project}</Row>
          <Row label="Baris RKA">{d.line}</Row>
          <Row label="Deskripsi pembayaran">{d.description}</Row>
          <Row label="Dibayar kepada">{d.payee}</Row>
          <Row label="Rekening tujuan">{d.payeeAccount}</Row>
          <Row label="Jatuh tempo">{d.dueOn}</Row>
        </tbody>
      </table>

      <table className="w-full border border-neutral-400" aria-label="Rincian nominal">
        <tbody className="[&_td]:border-t [&_td]:border-neutral-300 [&_td]:px-3 [&_td]:py-1.5">
          <tr>
            <td>Nominal (DPP)</td>
            <td className="tabular text-right">{formatIdr(gross)}</td>
          </tr>
          <tr>
            <td>PPN</td>
            <td className="tabular text-right">{formatIdr(ppn)}</td>
          </tr>
          <tr>
            <td>PPh dipotong</td>
            <td className="tabular text-right">({formatIdr(pph)})</td>
          </tr>
          <tr className="font-bold">
            <td>Nominal Pembayaran (nett)</td>
            <td className="tabular text-right" data-testid="formulir-nett">
              {formatIdr(nett)}
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="italic" data-testid="formulir-terbilang">
              Terbilang: {terbilang(nett)}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="w-full">
        <tbody>
          <Row label="Dokumen terlampir">{d.documents.length ? d.documents.join(", ") : null}</Row>
          <Row label="Bank asal">{d.bank}</Row>
          <Row label="Jadwal bayar">{d.scheduledOn}</Row>
          <Row label="Tanggal bayar">{d.paidOn}</Row>
        </tbody>
      </table>

      <section aria-label="Persetujuan" className="grid grid-cols-5 border border-neutral-400 text-center">
        {d.signs.map((s) => (
          <div key={s.step} className="grid grid-rows-[auto_4.5rem_auto] border-l border-neutral-400 first:border-l-0">
            <p className="border-b border-neutral-400 px-1 py-1 text-xs font-semibold">{s.step}</p>
            <p className="flex items-center justify-center px-1 text-[11px] text-neutral-500">{s.at ? `Disetujui elektronik ${s.at}` : "Belum"}</p>
            <p className="border-t border-neutral-400 px-1 py-1 text-xs">
              <span className="block font-medium">{s.name ?? " "}</span>
              <span className="text-neutral-500">{s.role}</span>
            </p>
          </div>
        ))}
      </section>
      <p className="text-[11px] text-neutral-500">Dicetak dari ERP Estrada. Persetujuan tercatat di aplikasi beserta jejak auditnya; formulir ini tidak memerlukan tanda tangan basah.</p>
    </article>
  );
}
