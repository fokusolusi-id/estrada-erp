import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectTelkom } from "./project-telkom";

type Result = { ok: boolean; message: string };
const fns = () => ({
  onScheme: vi.fn<(telkomScheme: boolean) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
  onRecord: vi.fn<(kind: "bard" | "baut", doc: { nomor: string; tanggal: string }) => Promise<Result>>(async () => ({ ok: true, message: "ok" })),
});
const props = { telkomScheme: true, bard: null, baut: null, rfsApproved: true, locked: false, canRecord: true };

describe("ProjectTelkom", () => {
  it("hides the documents for a project outside the TELKOM scheme, and lets BCD switch the scheme on", async () => {
    const f = fns();
    render(<ProjectTelkom {...props} telkomScheme={false} {...f} />);
    expect(screen.queryByTestId("telkom-bard")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(f.onScheme).toHaveBeenCalledWith(true));
  });

  it("lets Assurance record BARD and BAUT once RFS is approved", async () => {
    const f = fns();
    render(<ProjectTelkom {...props} {...f} />);
    const bard = within(screen.getByTestId("telkom-bard"));
    fireEvent.change(bard.getByLabelText("Nomor BARD"), { target: { value: "BARD/1" } });
    fireEvent.change(bard.getByLabelText("Tanggal BARD"), { target: { value: "2027-07-01" } });
    fireEvent.click(bard.getByRole("button", { name: "Catat BARD" }));
    await waitFor(() => expect(f.onRecord).toHaveBeenCalledWith("bard", { nomor: "BARD/1", tanggal: "2027-07-01" }));
  });

  it("waits for RFS before the documents can be recorded", () => {
    render(<ProjectTelkom {...props} rfsApproved={false} {...fns()} />);
    expect(screen.getByText("BARD dan BAUT dicatat setelah RFS disahkan.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Catat BARD" })).toBeNull();
  });

  it("shows recorded documents and goes read-only once the BAST is approved", () => {
    render(<ProjectTelkom {...props} bard={{ nomor: "BARD/1", tanggal: "2027-07-01" }} baut={{ nomor: "BAUT/1", tanggal: "2027-07-02" }} locked {...fns()} />);
    expect(screen.getByTestId("telkom-bard").textContent).toContain("BARD/1");
    expect(screen.getByTestId("telkom-baut").textContent).toContain("2 Jul 2027");
    expect(screen.queryByRole("button", { name: "Ubah BARD" })).toBeNull();
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
  });

  it("keeps the scheme switch and documents away from people who may not record", () => {
    render(<ProjectTelkom {...props} canRecord={false} {...fns()} />);
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Catat BARD" })).toBeNull();
  });
});
