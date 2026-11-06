import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PipelineRegister, type RegisterDeal } from "./pipeline-register";

// Deals as in the Pipeline sheet (rows 3 and 59), value excluding PPN.
const deals: RegisterDeal[] = [
  { id: "a", entity: "ESTRADA", customer: "Telkom", endCustomer: "Korlantas", segment: "Telco Business", project: "Sewa CPE SBST Online Korlantas", coaCode: "4100", value: "577320000", status: "WB", probability: "90", type: "renewal", startMonth: 1, endMonth: 12, editable: true },
  { id: "b", entity: "MATRIK", customer: "Telkom", endCustomer: "Korlantas", segment: "Government Business", project: "Harwat Sistem Monitoring Center", coaCode: "4200", value: "6000000000", status: "PP", probability: "10", type: "new", startMonth: 7, endMonth: 12, editable: true },
];
const options = {
  entities: ["ESTRADA", "MATRIK"],
  coa: [
    { code: "4100", name: "Pendapatan Sewa CPE (Router Gateway)" },
    { code: "4200", name: "Pendapatan Harwat Smart City" },
  ],
};
const ok = () => vi.fn(async () => ({ ok: true, message: "Deal disimpan." }));

describe("PipelineRegister", () => {
  it("lists deals with their weighted value and filters by segment and status", () => {
    render(<PipelineRegister deals={deals} options={options} canAdd onSave={ok()} onDelete={ok()} />);
    expect(within(screen.getByTestId("deal-a")).getByTestId("weighted").textContent).toBe("Rp 519.588.000");
    fireEvent.change(screen.getByLabelText("Segmen"), { target: { value: "Government Business" } });
    expect(screen.queryByTestId("deal-a")).toBeNull();
    fireEvent.change(screen.getByLabelText("Segmen"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "WB" } });
    expect(screen.queryByTestId("deal-b")).toBeNull();
    expect(screen.getByTestId("register-total").textContent).toContain("Rp 519.588.000");
  });

  it("adds a deal, warning but not blocking when the probability sits outside its status band", async () => {
    const onSave = ok();
    render(<PipelineRegister deals={deals} options={options} canAdd onSave={onSave} onDelete={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah deal" }));
    const form = within(screen.getByRole("form", { name: "Deal" }));
    fireEvent.change(form.getByLabelText("Customer"), { target: { value: "Kemhan" } });
    fireEvent.change(form.getByLabelText("Project"), { target: { value: "Platform Digital Workspace" } });
    fireEvent.change(form.getByLabelText("Nilai (exclude PPN)"), { target: { value: "24.379.658.426" } });
    fireEvent.change(form.getByLabelText("Status deal"), { target: { value: "PP" } });
    fireEvent.change(form.getByLabelText("Probabilitas (%)"), { target: { value: "90" } });
    expect(form.getByText("Probabilitas di luar rentang status PP (0–30%)")).toBeTruthy();
    fireEvent.click(form.getByRole("button", { name: "Simpan deal" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: null, customer: "Kemhan", project: "Platform Digital Workspace", value: "24379658426", status: "PP", probability: "90", entity: "ESTRADA" }),
      ),
    );
    expect(await screen.findByText("Deal disimpan.")).toBeTruthy();
  });

  it("blocks saving a deal without a customer or value", () => {
    render(<PipelineRegister deals={deals} options={options} canAdd onSave={ok()} onDelete={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah deal" }));
    expect((screen.getByRole("button", { name: "Simpan deal" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is read-only for readers: no add, no edit", () => {
    render(<PipelineRegister deals={deals.map((d) => ({ ...d, editable: false }))} options={options} canAdd={false} onSave={ok()} onDelete={ok()} />);
    expect(screen.queryByRole("button", { name: "Tambah deal" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Ubah/ })).toBeNull();
  });
});
