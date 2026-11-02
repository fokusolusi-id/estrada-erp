import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HeadcountPlan, type PlanPosition } from "./headcount-plan";

const masters = {
  coa: [
    { code: "6211", name: "Beban Gaji dan THR" },
    { code: "6221", name: "Beban rekrutmen" },
  ],
  entities: ["ESTRADA", "MATRIK"],
};
// HCM sheet row 33: 6 Account Managers for CBD, Rp 100.500.000 a month from January.
const positions: PlanPosition[] = [
  { id: "11111111-1111-4111-8111-111111111111", position: "Account Manager", entityCode: "ESTRADA", coaCode: "6221", count: 6, startMonth: 1, costPerHead: "16750000" },
];
const ok = () => vi.fn(async () => ({ ok: true, message: "Posisi tersimpan.", id: "22222222-2222-4222-8222-222222222222" }));
const setup = (over: Partial<Parameters<typeof HeadcountPlan>[0]> = {}) => {
  const props = { positions, masters, defaultCoa: "6221", defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok(), ...over };
  render(<HeadcountPlan {...props} />);
  return props;
};

describe("HeadcountPlan", () => {
  it("shows what each position costs in 2027, computed from heads, cost per head and start month", () => {
    setup();
    expect(screen.getByTestId("headcount-total-1").textContent).toBe("Rp 1.206.000.000");
    fireEvent.change(screen.getByLabelText("Mulai posisi 1"), { target: { value: "7" } });
    expect(screen.getByTestId("headcount-total-1").textContent).toBe("Rp 603.000.000");
  });

  it("saves numbers, not formatted text", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Jumlah orang posisi 1"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan posisi 1" }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        id: positions[0]!.id,
        position: "Account Manager",
        entityCode: "ESTRADA",
        coaCode: "6221",
        count: 7,
        startMonth: 1,
        costPerHead: "16750000",
      }),
    );
    expect(await screen.findByText("Posisi tersimpan.")).toBeTruthy();
  });

  it("adds a position on the recruitment COA and shows what the server rejects", async () => {
    const onSave = vi.fn(async () => ({ ok: false, message: "Periksa isian posisi.", errors: { position: "Jabatan wajib diisi" } }));
    setup({ positions: [], onSave });
    expect(screen.getByText(/Belum ada posisi/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tambah posisi/ }));
    expect((screen.getByLabelText("COA posisi 1") as HTMLSelectElement).value).toBe("6221");
    fireEvent.change(screen.getByLabelText("Biaya per orang posisi 1"), { target: { value: "4.100.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan posisi 1" }));
    expect(await screen.findByText("Jabatan wajib diisi")).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ count: 1, startMonth: 1, costPerHead: "4100000" }));
  });

  it("does not send a cost it cannot read", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Biaya per orang posisi 1"), { target: { value: "empat juta" } });
    expect((screen.getByRole("button", { name: "Simpan posisi 1" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops a position once its line is sent, and keeps one saved since the page loaded", async () => {
    const props = { positions, masters, defaultCoa: "6221", defaultEntity: "ESTRADA", onSave: ok(), onDelete: ok() };
    const { rerender } = render(<HeadcountPlan {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Tambah posisi/ }));
    fireEvent.change(screen.getByLabelText("Jabatan posisi 2"), { target: { value: "OB" } });
    fireEvent.change(screen.getByLabelText("Biaya per orang posisi 2"), { target: { value: "4.100.000" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan posisi 2" }));
    expect(await screen.findByText("Posisi tersimpan.")).toBeTruthy();
    rerender(<HeadcountPlan {...props} positions={[]} />);
    expect(screen.queryByDisplayValue("Account Manager")).toBeNull();
    expect(screen.getByDisplayValue("OB")).toBeTruthy();
  });

  it("removes a saved position", async () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Hapus posisi 1" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(positions[0]!.id));
    await waitFor(() => expect(screen.queryByLabelText("Jabatan posisi 1")).toBeNull());
  });
});
