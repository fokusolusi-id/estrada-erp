import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectPlanning, type GateView, type PlanningRow } from "./project-planning";

type Result = { ok: boolean; message: string };
const row = (over: Partial<PlanningRow>): PlanningRow => ({ key: "kickoff", name: "Notulen dan daftar hadir kick-off", owner: "Project Manager", stage: "Initiation", reference: null, recordedBy: null, recordedOn: null, canRecord: false, ...over });
const items = [
  row({ canRecord: true }),
  row({ key: "mom", name: "MoM kick-off", owner: "Project Admin" }),
  row({ key: "charter", name: "Project Charter", stage: "Planning", reference: "Drive/charter", recordedBy: "Rina", recordedOn: "2026-11-05" }),
  row({ key: "risk", name: "Risk Register", stage: "Planning" }),
];
const gate = (over: Partial<GateView> = {}): GateView => ({ on: null, blockers: [], canApprove: false, ...over });
const fns = () => ({
  onSave: vi.fn<(key: string, reference: string) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onApproveGate: vi.fn<() => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onApproveBaseline: vi.fn<(rfsTargetOn: string) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
});

describe("ProjectPlanning", () => {
  it("lets the owner record where a document is kept, and shows who recorded the rest", async () => {
    const f = fns();
    render(<ProjectPlanning items={items} gate={gate()} baseline={gate()} rfsTargetOn={null} {...f} />);
    fireEvent.change(screen.getByLabelText("Rujukan (tempat berkas disimpan)"), { target: { value: "Drive/kickoff" } });
    fireEvent.click(screen.getByRole("button", { name: "Catat" }));
    await waitFor(() => expect(f.onSave).toHaveBeenCalledWith("kickoff", "Drive/kickoff"));
    expect(within(screen.getByTestId("plan-charter")).getByText("Drive/charter")).toBeTruthy();
    expect(within(screen.getByTestId("plan-mom")).queryByRole("button")).toBeNull();
  });

  it("lists what blocks a gate and hides the approval button until nothing does", () => {
    const { rerender } = render(<ProjectPlanning items={items} gate={gate({ blockers: ["MoM kick-off belum dicatat."], canApprove: true })} baseline={gate()} rfsTargetOn={null} {...fns()} />);
    expect(within(screen.getByTestId("gate-kickoff")).getByTestId("blockers").textContent).toBe("MoM kick-off belum dicatat.");
    expect(within(screen.getByTestId("gate-kickoff")).getByRole("button", { name: "Sahkan Kick-Off Gate" })).toHaveProperty("disabled", true);
    rerender(<ProjectPlanning items={items} gate={gate({ canApprove: true })} baseline={gate()} rfsTargetOn={null} {...fns()} />);
    expect(within(screen.getByTestId("gate-kickoff")).getByRole("button", { name: "Sahkan Kick-Off Gate" })).toHaveProperty("disabled", false);
  });

  it("asks the Head PMO for the target RFS date when approving the baseline", async () => {
    const f = fns();
    render(<ProjectPlanning items={items} gate={gate({ on: "2026-11-02" })} baseline={gate({ canApprove: true })} rfsTargetOn={null} {...f} />);
    const approve = screen.getByRole("button", { name: "Sahkan baseline" });
    expect(approve).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Target RFS"), { target: { value: "2027-06-30" } });
    fireEvent.click(approve);
    await waitFor(() => expect(f.onApproveBaseline).toHaveBeenCalledWith("2027-06-30"));
  });

  it("shows an approved baseline with its target RFS date and no approval left", () => {
    render(<ProjectPlanning items={items} gate={gate({ on: "2026-11-02" })} baseline={gate({ on: "2026-11-06", canApprove: true })} rfsTargetOn="2027-06-30" {...fns()} />);
    const b = within(screen.getByTestId("gate-baseline"));
    expect(b.getByTestId("state").textContent).toBe("Disahkan 6 Nov 2026");
    expect(b.getByText("Target RFS: 30 Jun 2027")).toBeTruthy();
    expect(b.queryByRole("button", { name: "Sahkan baseline" })).toBeNull();
  });
});
