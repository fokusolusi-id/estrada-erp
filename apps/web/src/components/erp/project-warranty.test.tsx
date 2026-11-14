import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectWarranty, type DefectView, type WarrantyView } from "./project-warranty";

type Result = { ok: boolean; message: string };
const view = (over: Partial<WarrantyView> = {}): WarrantyView => ({
  bastOn: "2027-07-05",
  msoAcceptedOn: "2027-07-19",
  transitionDays: 14,
  warrantyEndsOn: "2028-07-05",
  closedOn: null,
  closureBlockers: [],
  canSetWarranty: false,
  canReport: false,
  canClose: false,
  ...over,
});
const defect = (over: Partial<DefectView> = {}): DefectView => ({
  id: "d1",
  site: "POLDA-JATIM-01",
  description: "Router mati sejak dipasang",
  status: "Diajukan",
  reportedBy: "Sari",
  reportedOn: "2027-08-01",
  confirmedIso: null,
  confirmedPmo: null,
  rejectNote: null,
  fixNote: null,
  steps: [],
  ...over,
});
const fns = () => ({
  onSetWarranty: vi.fn<(endsOn: string) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onReport: vi.fn<(input: { description: string; siteId: string | null }) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onStep: vi.fn<(defectId: string, action: string, text?: string) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onClose: vi.fn<() => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
});
const sites = [{ id: "s1", kode: "POLDA-JATIM-01" }];

describe("ProjectWarranty", () => {
  it("shows the transition period between BAST and MSO's acceptance", () => {
    render(<ProjectWarranty view={view()} defects={[]} sites={sites} {...fns()} />);
    const dates = within(screen.getByTestId("warranty-dates"));
    expect(dates.getByText("14 hari")).toBeTruthy();
    expect(dates.getByText("Tetap tanggung jawab PMO")).toBeTruthy();
  });

  it("lets BCD set the warranty end date", async () => {
    const f = fns();
    render(<ProjectWarranty view={view({ warrantyEndsOn: null, canSetWarranty: true })} defects={[]} sites={sites} {...f} />);
    fireEvent.change(screen.getByLabelText("Tanggal akhir garansi terakhir"), { target: { value: "2028-07-05" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan akhir garansi" }));
    await waitFor(() => expect(f.onSetWarranty).toHaveBeenCalledWith("2028-07-05"));
  });

  it("lets ISO report a fault against a site", async () => {
    const f = fns();
    render(<ProjectWarranty view={view({ canReport: true })} defects={[]} sites={sites} {...f} />);
    fireEvent.change(screen.getByLabelText("Uraian gangguan"), { target: { value: "Router mati sejak dipasang" } });
    fireEvent.change(screen.getByLabelText("Lokasi"), { target: { value: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: "Laporkan" }));
    await waitFor(() => expect(f.onReport).toHaveBeenCalledWith({ description: "Router mati sejak dipasang", siteId: "s1" }));
  });

  it("shows which head has confirmed, and asks for a reason before setting a fault aside as operational", async () => {
    const f = fns();
    render(<ProjectWarranty view={view()} defects={[defect({ confirmedIso: "Andi", steps: ["confirm_pmo", "reject"] })]} sites={sites} {...f} />);
    const row = within(screen.getByTestId("defect-d1"));
    expect(row.getByText("Head ISO: Andi")).toBeTruthy();
    expect(row.getByText("Head PMO: belum")).toBeTruthy();
    fireEvent.click(row.getByRole("button", { name: "Gangguan operasional" }));
    expect(row.getByRole("button", { name: "Simpan" })).toHaveProperty("disabled", true);
    fireEvent.change(row.getByLabelText("Alasan bukan cacat bawaan"), { target: { value: "Tersambar petir" } });
    fireEvent.click(row.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(f.onStep).toHaveBeenCalledWith("d1", "reject", "Tersambar petir"));
  });

  it("says whose budget pays once the heads have classified the fault", () => {
    const { rerender } = render(<ProjectWarranty view={view()} defects={[defect()]} sites={sites} {...fns()} />);
    expect(screen.queryByTestId("cost")).toBeNull();
    rerender(<ProjectWarranty view={view()} defects={[defect({ status: "Cacat_Bawaan" })]} sites={sites} {...fns()} />);
    expect(screen.getByTestId("cost").textContent).toContain("Anggaran proyek");
    rerender(<ProjectWarranty view={view()} defects={[defect({ status: "Operasional" })]} sites={sites} {...fns()} />);
    expect(screen.getByTestId("cost").textContent).toContain("Anggaran layanan dengan persetujuan Head ISO");
  });

  it("confirms without a note", async () => {
    const f = fns();
    render(<ProjectWarranty view={view()} defects={[defect({ steps: ["confirm_pmo"] })]} sites={sites} {...f} />);
    fireEvent.click(screen.getByRole("button", { name: "Tetapkan cacat bawaan (PMO)" }));
    await waitFor(() => expect(f.onStep).toHaveBeenCalledWith("d1", "confirm_pmo"));
  });

  it("lists what blocks closing and hides the button until nothing does", () => {
    const { rerender } = render(<ProjectWarranty view={view({ canClose: true, closureBlockers: ["Masa garansi belum berakhir."] })} defects={[]} sites={sites} {...fns()} />);
    expect(screen.getByTestId("closure-blockers").textContent).toBe("Masa garansi belum berakhir.");
    expect(screen.queryByRole("button", { name: "Nyatakan proyek ditutup" })).toBeNull();
    rerender(<ProjectWarranty view={view({ canClose: true })} defects={[]} sites={sites} {...fns()} />);
    expect(screen.getByTestId("closure-state").textContent).toBe("Siap ditutup");
    expect(screen.getByRole("button", { name: "Nyatakan proyek ditutup" })).toBeTruthy();
  });

  it("shows a closed project as closed, with no actions left", () => {
    render(<ProjectWarranty view={view({ closedOn: "2028-07-10", canClose: true, canReport: true, canSetWarranty: true })} defects={[]} sites={sites} {...fns()} />);
    expect(screen.getByTestId("closure-state").textContent).toBe("Ditutup 10 Jul 2028");
    expect(screen.queryByRole("button", { name: "Nyatakan proyek ditutup" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Laporkan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Simpan akhir garansi" })).toBeNull();
  });
});
