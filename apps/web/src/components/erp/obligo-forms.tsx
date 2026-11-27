"use client";

import { useState, useTransition } from "react";
import { BG_TYPES, BG_TYPE_LABEL, DRAWING_KIND_LABEL, FACILITY_TYPES, FACILITY_TYPE_LABEL, drawingKindsFor, type FacilityType } from "@estrada/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "./money-input";

type Result = { ok: boolean; message: string };
const SELECT = "border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none";
const PANEL = "bg-muted/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3";

const field = (label: string, input: React.ReactNode) => (
  <label className="grid gap-1 text-sm">
    <span className="text-muted-foreground text-xs">{label}</span>
    {input}
  </label>
);
const select = (label: string, value: string, onChange: (v: string) => void, options: readonly (readonly [string, string])[], blank?: string) =>
  field(
    label,
    <select aria-label={label} className={SELECT} value={value} onChange={(e) => onChange(e.target.value)}>
      {blank !== undefined ? <option value="">{blank}</option> : null}
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>,
  );
const text = (label: string, value: string, onChange: (v: string) => void, type = "text") =>
  field(label, <Input aria-label={label} type={type} value={value} onChange={(e) => onChange(e.target.value)} />);
const rupiah = (label: string, value: string, onChange: (v: string) => void) => field(label, <MoneyInput aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />);

function useResult() {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (work: () => Promise<Result>, done?: () => void) =>
    startTransition(async () => {
      const r = await work();
      setResult(r);
      if (r.ok) done?.();
    });
  const message = result ? <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>{result.message}</p> : null;
  return { pending, run, message };
}

export interface FacilityValues {
  id: string;
  bankName: string;
  name: string;
  type: FacilityType;
  entityCode: string;
  plafon: string;
  expiresOn: string;
  contractNo: string;
  interestDay: string;
  escrowAccount: string;
  active: boolean;
}

/** Add a facility, or change one picked from the list. */
export function FacilityForm({ facilities, entities, onSave }: { facilities: readonly FacilityValues[]; entities: readonly string[]; onSave: (v: FacilityValues) => Promise<Result> }) {
  const blank: FacilityValues = { id: "", bankName: "", name: "", type: "kmk", entityCode: entities[0] ?? "", plafon: "", expiresOn: "", contractNo: "", interestDay: "", escrowAccount: "", active: true };
  const [v, setV] = useState(blank);
  const { pending, run, message } = useResult();
  const set = (k: keyof FacilityValues) => (value: string) => setV({ ...v, [k]: value });
  return (
    <form aria-label="Fasilitas bank" className={PANEL} onSubmit={(e) => (e.preventDefault(), run(() => onSave(v), () => setV(blank)))}>
      {select("Ubah fasilitas", v.id, (id) => setV(facilities.find((f) => f.id === id) ?? blank), facilities.map((f) => [f.id, `${f.bankName} ${f.name}${f.entityCode ? ` · ${f.entityCode}` : ""}`] as const), "— Fasilitas baru —")}
      {text("Bank", v.bankName, set("bankName"))}
      {text("Nama fasilitas", v.name, set("name"))}
      {select("Jenis fasilitas", v.type, set("type"), FACILITY_TYPES.map((t) => [t, FACILITY_TYPE_LABEL[t]] as const))}
      {select("Perusahaan", v.entityCode, set("entityCode"), entities.map((e) => [e, e] as const), "Bersama (dipilih per penarikan)")}
      {rupiah("Plafon", v.plafon, set("plafon"))}
      {text("Expired plafon", v.expiresOn, set("expiresOn"), "date")}
      {text("No akad", v.contractNo, set("contractNo"))}
      {text("Tanggal bunga (1–31)", v.interestDay, set("interestDay"))}
      {text("Rekening escrow", v.escrowAccount, set("escrowAccount"))}
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Aktif
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          Simpan fasilitas
        </Button>
        {message}
      </div>
    </form>
  );
}

export function DrawingForm({
  facilities,
  projects,
  entities,
  onRequest,
}: {
  facilities: readonly { id: string; label: string; type: FacilityType; entityCode: string | null }[];
  projects: readonly { id: string; entity: string; name: string }[];
  entities: readonly string[];
  onRequest: (form: FormData) => Promise<Result>;
}) {
  const [facilityId, setFacility] = useState("");
  const [kind, setKind] = useState("bg");
  const [amount, setAmount] = useState("");
  const { pending, run, message } = useResult();
  const facility = facilities.find((f) => f.id === facilityId);
  const kinds = facility ? drawingKindsFor(facility.type) : (["bg", "loan"] as const);
  const chosen = kinds.find((k) => k === kind) ?? kinds[0]!;
  return (
    <form
      aria-label="Permintaan obligo"
      className={PANEL}
      onSubmit={(e) => {
        e.preventDefault();
        const element = e.currentTarget;
        const data = new FormData(element);
        run(() => onRequest(data), () => (element.reset(), setAmount("")));
      }}
    >
      {field(
        "Fasilitas",
        <select name="facilityId" aria-label="Fasilitas" className={SELECT} value={facilityId} onChange={(e) => setFacility(e.target.value)}>
          <option value="">— Pilih fasilitas —</option>
          {facilities.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>,
      )}
      {field(
        "Jenis",
        <select name="kind" aria-label="Jenis" className={SELECT} value={chosen} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {DRAWING_KIND_LABEL[k]}
            </option>
          ))}
        </select>,
      )}
      {chosen === "bg"
        ? field(
            "Tipe BG",
            <select name="bgType" aria-label="Tipe BG" className={SELECT}>
              {BG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BG_TYPE_LABEL[t]}
                </option>
              ))}
            </select>,
          )
        : null}
      {field(
        chosen === "bg" ? "Proyek (wajib)" : "Proyek",
        <select name="projectId" aria-label="Proyek" className={SELECT}>
          <option value="">— Tanpa proyek —</option>
          {projects
            .filter((p) => !facility?.entityCode || p.entity === facility.entityCode)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.entity}
              </option>
            ))}
        </select>,
      )}
      {facility && !facility.entityCode
        ? field(
            "Perusahaan",
            <select name="entityCode" aria-label="Perusahaan" className={SELECT}>
              {entities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>,
          )
        : null}
      {field("Nilai", <MoneyInput name="amount" aria-label="Nilai" value={amount} onChange={(e) => setAmount(e.target.value)} />)}
      {field("Underlying (kontrak / KL)", <Input name="underlying" aria-label="Underlying (kontrak / KL)" />)}
      {field("Dokumen underlying", <Input name="document" type="file" aria-label="Dokumen underlying" accept=".pdf,image/*" />)}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          Ajukan ke Cash Management
        </Button>
        {message}
      </div>
    </form>
  );
}

/** The buttons a drawing offers this person: approve with the bank's details, reject, confirm or release a guarantee. */
export function DrawingActions({
  id,
  today,
  may,
  onIssue,
  onReject,
  onConfirm,
  onRelease,
}: {
  id: string;
  today: string;
  may: { decide: boolean; confirm: boolean; release: boolean };
  onIssue: (v: { id: string; reference: string; issuedOn: string; dueOn: string }) => Promise<Result>;
  onReject: (id: string, reason: string) => Promise<Result>;
  onConfirm: (id: string) => Promise<Result>;
  onRelease: (id: string) => Promise<Result>;
}) {
  const [v, setV] = useState({ reference: "", issuedOn: today, dueOn: "", reason: "" });
  const { pending, run, message } = useResult();
  const small = (label: string, key: keyof typeof v, type = "text") => <Input aria-label={label} placeholder={label} title={label} type={type} className="h-8 w-40" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} />;
  return (
    <div className="grid gap-2">
      {may.decide ? (
        <>
          <div className="flex flex-wrap gap-2">
            {small("No BG / akad", "reference")}
            {small("Tanggal terbit", "issuedOn", "date")}
            {small("Jatuh tempo", "dueOn", "date")}
            <Button type="button" size="sm" disabled={pending} onClick={() => run(() => onIssue({ id, reference: v.reference, issuedOn: v.issuedOn, dueOn: v.dueOn }))}>
              Terbitkan
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {small("Alasan penolakan", "reason")}
            <Button type="button" size="sm" variant="ghost" disabled={pending || v.reason.trim().length < 5} onClick={() => run(() => onReject(id, v.reason))}>
              Tolak
            </Button>
          </div>
        </>
      ) : null}
      {may.confirm ? (
        <Button type="button" size="sm" variant="outline" className="w-fit" disabled={pending} onClick={() => run(() => onConfirm(id))}>
          Konfirmasi kontrak selesai
        </Button>
      ) : null}
      {may.release ? (
        <Button type="button" size="sm" className="w-fit" disabled={pending} onClick={() => run(() => onRelease(id))}>
          Lepas BG
        </Button>
      ) : null}
      {message}
    </div>
  );
}

export interface PaymentValues {
  facilityId: string;
  drawingId: string;
  entityCode: string;
  paidOn: string;
  principal: string;
  interest: string;
  reference: string;
}

export function FacilityPaymentForm({
  facilities,
  loans,
  entities,
  today,
  onRecord,
}: {
  facilities: readonly { id: string; label: string; entityCode: string | null }[];
  loans: readonly { id: string; facilityId: string; label: string }[];
  entities: readonly string[];
  today: string;
  onRecord: (v: PaymentValues) => Promise<Result>;
}) {
  const blank: PaymentValues = { facilityId: "", drawingId: "", entityCode: entities[0] ?? "", paidOn: today, principal: "", interest: "", reference: "" };
  const [v, setV] = useState(blank);
  const { pending, run, message } = useResult();
  const set = (k: keyof PaymentValues) => (value: string) => setV({ ...v, [k]: value });
  const facility = facilities.find((f) => f.id === v.facilityId);
  return (
    <form aria-label="Pembayaran fasilitas" className={PANEL} onSubmit={(e) => (e.preventDefault(), run(() => onRecord(v), () => setV(blank)))}>
      {select("Fasilitas dibayar", v.facilityId, (id) => setV({ ...v, facilityId: id, drawingId: "" }), facilities.map((f) => [f.id, f.label] as const), "— Pilih fasilitas —")}
      {select("Penarikan (untuk pokok)", v.drawingId, set("drawingId"), loans.filter((l) => l.facilityId === v.facilityId).map((l) => [l.id, l.label] as const), "— Bunga saja —")}
      {facility && !facility.entityCode && !v.drawingId ? select("Perusahaan pembayar", v.entityCode, set("entityCode"), entities.map((e) => [e, e] as const)) : null}
      {text("Tanggal bayar", v.paidOn, set("paidOn"), "date")}
      {rupiah("Pokok", v.principal, set("principal"))}
      {rupiah("Bunga", v.interest, set("interest"))}
      {text("Referensi mutasi bank", v.reference, set("reference"))}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="submit" disabled={pending}>
          Catat pembayaran
        </Button>
        {message}
      </div>
    </form>
  );
}

export function ReversePayment({ id, onReverse }: { id: string; onReverse: (id: string, reason: string) => Promise<Result> }) {
  const [reason, setReason] = useState<string | null>(null);
  const { pending, run, message } = useResult();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {reason === null ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => setReason("")}>
          Batalkan
        </Button>
      ) : (
        <>
          <Input aria-label="Alasan pembatalan" placeholder="Alasan pembatalan" className="h-8 w-48" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="button" size="sm" disabled={pending || reason.trim().length < 5} onClick={() => run(() => onReverse(id, reason))}>
            Konfirmasi
          </Button>
        </>
      )}
      {message}
    </div>
  );
}
