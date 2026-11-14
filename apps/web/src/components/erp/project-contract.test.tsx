import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectContract } from "./project-contract";

const change = () => vi.fn<(contractSites: number, reason: string) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: true, message: "ok" }));

describe("ProjectContract", () => {
  it("shows the contract count against the registered sites", () => {
    render(<ProjectContract contractSites={206} registered={150} canChange={false} locked={false} onChange={change()} />);
    expect(screen.getByTestId("project-contract").textContent).toContain("206");
    expect(screen.getByTestId("project-contract").textContent).toContain("150 terdaftar");
    expect(screen.queryByRole("button", { name: "Ubah jumlah lokasi" })).toBeNull();
  });

  it("lets BCD change the count with a reason, and not below the registered sites", async () => {
    const onChange = change();
    render(<ProjectContract contractSites={206} registered={150} canChange locked={false} onChange={onChange} />);
    const submit = screen.getByRole("button", { name: "Ubah jumlah lokasi" });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Jumlah baru"), { target: { value: "149" } });
    fireEvent.change(screen.getByLabelText("Dasar perubahan"), { target: { value: "Addendum 2" } });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Jumlah baru"), { target: { value: "210" } });
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.click(submit);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(210, "Addendum 2"));
  });

  it("is read-only once the BAST is approved", () => {
    render(<ProjectContract contractSites={206} registered={206} canChange locked onChange={change()} />);
    expect(screen.getByTestId("project-contract").textContent).toContain("tidak dapat diubah lagi");
    expect(screen.queryByLabelText("Jumlah baru")).toBeNull();
  });
});
