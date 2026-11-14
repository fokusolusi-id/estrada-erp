import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SiteBai, type BaiInput, type BaiSite } from "./site-bai";

const bai = { nomor: "BAI/POLDA-JATIM/001", tanggal: "2027-03-28", evidence: "Drive/SBST/POLDA-JATIM-01", collectedBy: "dc", compiledBy: null, verifiedBy: null, spotCheckPassed: null };
const sites: BaiSite[] = [
  { id: "a", kode: "POLDA-JATIM-01", nama: "Polda Jawa Timur", status: "Uji", bai: null, baiReturnNote: null },
  { id: "b", kode: "POLDA-JABAR-01", nama: "Polda Jawa Barat", status: "BAI_Terbit", ujiPetik: true, bai, baiReturnNote: null },
  { id: "c", kode: "POLDA-BALI-01", nama: "Polda Bali", status: "BAI_Terverifikasi", bai: { ...bai, compiledBy: "pa" }, baiReturnNote: null },
  { id: "d", kode: "POLDA-NTB-01", nama: "Polda NTB", status: "Instalasi", bai: null, baiReturnNote: null },
];
const names = { dc: "Dewi", pa: "Putra" };
const none = { collect: false, compile: false, verify: false };
const ok = () => vi.fn<(siteId: string, input: BaiInput) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: true, message: "ok" }));
const back = () => vi.fn<(siteId: string, note: string) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: true, message: "ok" }));

describe("SiteBai", () => {
  it("lists tested sites with who holds each step, and who it is waiting for", () => {
    render(<SiteBai sites={sites} names={names} can={none} onStep={ok()} onReturn={back()} />);
    expect(screen.queryByTestId("bai-d")).toBeNull();
    expect(within(screen.getByTestId("bai-a")).getByText("Menunggu Delivery Control")).toBeTruthy();
    expect(within(screen.getByTestId("bai-b")).getByText("Menunggu Project Admin")).toBeTruthy();
    const c = within(screen.getByTestId("bai-c"));
    expect(c.getByText("Menunggu Assurance (BCD)")).toBeTruthy();
    expect(c.getByText("Dewi")).toBeTruthy();
    expect(c.getByText("Putra")).toBeTruthy();
  });

  it("lets Delivery Control record the BAI with its number, date and evidence", async () => {
    const onStep = ok();
    render(<SiteBai sites={sites} names={names} can={{ ...none, collect: true }} onStep={onStep} onReturn={back()} />);
    fireEvent.click(screen.getByRole("button", { name: "Catat BAI POLDA-JATIM-01" }));
    fireEvent.change(screen.getByLabelText("Nomor BAI"), { target: { value: "BAI/001" } });
    fireEvent.change(screen.getByLabelText("Tanggal BAI"), { target: { value: "2027-03-28" } });
    fireEvent.change(screen.getByLabelText("Rujukan evidence"), { target: { value: "Drive/SBST" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan BAI" }));
    await waitFor(() => expect(onStep).toHaveBeenCalledWith("a", { step: "collect", nomor: "BAI/001", tanggal: "2027-03-28", evidence: "Drive/SBST" }));
  });

  it("keeps the Project Admin from compiling a sample site until uji petik is marked passed", async () => {
    const onStep = ok();
    render(<SiteBai sites={sites} names={names} can={{ ...none, compile: true }} onStep={onStep} onReturn={back()} />);
    const compile = screen.getByRole("button", { name: "Kompilasi BAI POLDA-JABAR-01" });
    expect(compile).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByLabelText("Uji petik lulus"));
    fireEvent.click(compile);
    await waitFor(() => expect(onStep).toHaveBeenCalledWith("b", { step: "compile", spotCheckPassed: true }));
  });

  it("lets Assurance send a BAI back with a reason", async () => {
    const onReturn = back();
    render(<SiteBai sites={sites} names={names} can={{ ...none, verify: true }} onStep={ok()} onReturn={onReturn} />);
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan BAI POLDA-BALI-01" }));
    expect(screen.getByRole("button", { name: "Kembalikan BAI" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Alasan pengembalian"), { target: { value: "Jumlah perangkat tidak sesuai kontrak" } });
    fireEvent.click(screen.getByRole("button", { name: "Kembalikan BAI" }));
    await waitFor(() => expect(onReturn).toHaveBeenCalledWith("c", "Jumlah perangkat tidak sesuai kontrak"));
  });

  it("shows why a BAI was returned", () => {
    render(<SiteBai sites={[{ ...sites[0]!, baiReturnNote: "Tanda tangan PIC belum ada" }]} names={names} can={none} onStep={ok()} onReturn={back()} />);
    expect(screen.getByTestId("return-note").textContent).toBe("Dikembalikan: Tanda tangan PIC belum ada");
  });
});
