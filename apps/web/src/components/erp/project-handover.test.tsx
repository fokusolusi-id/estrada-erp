import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ARTEFACTS, EOS_CHECKLIST, MSO_CRITERIA } from "@estrada/domain";
import { ProjectHandover, type HandoverCan, type HandoverView } from "./project-handover";

type Result = { ok: boolean; message: string };
const mandatory = Object.fromEntries(ARTEFACTS.filter((a) => a.need === "wajib").map((a) => [a.no, `Drive/SBST/${a.no}`]));
const view = (over: Partial<HandoverView> = {}): HandoverView => ({
  status: "Disusun",
  hasApplication: false,
  artefacts: mandatory,
  criteria: {},
  checklist: {},
  returnNote: null,
  bastOn: "2027-07-05",
  submittedBy: null,
  msoAcceptedBy: null,
  msoAcceptedOn: null,
  checklistBy: null,
  isoAcceptedBy: null,
  ...over,
});
const none: HandoverCan = { artefact: false, submit: false, decide: false, checklist: false, acceptIso: false };
const fns = () => ({
  onSavePackage: vi.fn<(input: { hasApplication: boolean; references: Record<string, string> }) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onSubmit: vi.fn<() => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onDecide: vi.fn<(input: { accept: boolean; criteria: Record<string, boolean>; note?: string }) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onSaveChecklist: vi.fn<(checklist: Record<string, boolean>) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onAcceptIso: vi.fn<() => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
});

describe("ProjectHandover", () => {
  it("lists the 15 artefacts and lets the Project Manager submit a complete package", async () => {
    const f = fns();
    render(<ProjectHandover view={view()} can={{ ...none, artefact: true, submit: true }} {...f} />);
    expect(screen.getAllByTestId(/^artefact-/)).toHaveLength(15);
    expect(screen.getByTestId("missing").textContent).toBe("Semua artefak wajib sudah diisi.");
    fireEvent.click(screen.getByRole("button", { name: "Ajukan ke MSO" }));
    await waitFor(() => expect(f.onSubmit).toHaveBeenCalled());
  });

  it("names the missing artefacts and holds the submission, also when an application makes artefact 8 mandatory", () => {
    render(<ProjectHandover view={view({ artefacts: { ...mandatory, 6: "" } })} can={{ ...none, artefact: true, submit: true }} {...fns()} />);
    expect(screen.getByTestId("missing").textContent).toBe("1 artefak wajib belum diisi: nomor 6.");
    expect(screen.getByRole("button", { name: "Ajukan ke MSO" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText(/Proyek ini menyerahkan aplikasi/));
    expect(screen.getByTestId("missing").textContent).toBe("2 artefak wajib belum diisi: nomor 6, 8.");
  });

  it("holds the submission until the BAST is approved", () => {
    render(<ProjectHandover view={view({ bastOn: null })} can={{ ...none, artefact: true, submit: true }} {...fns()} />);
    expect(screen.getByTestId("missing").textContent).toBe("BAST belum disahkan; paket belum dapat diajukan.");
    expect(screen.getByRole("button", { name: "Ajukan ke MSO" })).toHaveProperty("disabled", true);
  });

  it("lets Head MSO accept only with all five criteria ticked, and return only with a note", async () => {
    const f = fns();
    render(<ProjectHandover view={view({ status: "Diajukan", submittedBy: "Rina" })} can={{ ...none, decide: true }} {...f} />);
    const accept = screen.getByRole("button", { name: "Terima serah terima" });
    const back = screen.getByRole("button", { name: "Kembalikan ke PMO" });
    expect(accept).toHaveProperty("disabled", true);
    expect(back).toHaveProperty("disabled", true);
    const mso = within(screen.getByTestId("handover-mso"));
    for (const c of MSO_CRITERIA.slice(0, 4)) fireEvent.click(mso.getByLabelText(new RegExp(c.label)));
    expect(accept).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/Catatan kekurangan/), { target: { value: "Daftar spare belum ada nomor seri" } });
    fireEvent.click(back);
    await waitFor(() => expect(f.onDecide).toHaveBeenCalledWith(expect.objectContaining({ accept: false, note: "Daftar spare belum ada nomor seri" })));
    fireEvent.click(mso.getByLabelText(new RegExp(MSO_CRITERIA[4].label)));
    fireEvent.click(accept);
    await waitFor(() => expect(f.onDecide).toHaveBeenLastCalledWith(expect.objectContaining({ accept: true })));
  });

  it("shows why a package came back", () => {
    render(<ProjectHandover view={view({ status: "Dikembalikan", returnNote: "Topologi as-built belum ada" })} can={none} {...fns()} />);
    expect(screen.getByTestId("return-note").textContent).toBe("Dikembalikan Head MSO: Topologi as-built belum ada");
  });

  it("keeps Head ISO waiting until the EOS checklist is complete", () => {
    const all = Object.fromEntries(EOS_CHECKLIST.map((c) => [c.key, true]));
    const { rerender } = render(<ProjectHandover view={view({ status: "Diterima_MSO", checklist: { ...all, aksesRemote: false } })} can={{ ...none, acceptIso: true }} {...fns()} />);
    expect(screen.queryByRole("button", { name: "Terima turunan teknis" })).toBeNull();
    expect(within(screen.getByTestId("handover-iso")).getByText("Menunggu checklist operasional EOS lengkap.")).toBeTruthy();
    rerender(<ProjectHandover view={view({ status: "Diterima_MSO", checklist: all })} can={{ ...none, acceptIso: true }} {...fns()} />);
    expect(screen.getByRole("button", { name: "Terima turunan teknis" })).toBeTruthy();
  });
});
