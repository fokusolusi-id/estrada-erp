import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectSites, type SiteView } from "./project-sites";

// Kamus Field B: kode_site POLDA-JATIM-01, planned for 31 March 2027.
const sites: SiteView[] = [
  { id: "a", kode: "POLDA-JATIM-01", nama: "Polda Jawa Timur", alamat: "Jl. Ahmad Yani 116, Surabaya", wilayah: "Jawa Timur", status: "Instalasi", tglPlanSelesai: "2027-03-31", tglAktualSelesai: null },
  { id: "b", kode: "POLDA-JABAR-01", nama: "Polda Jawa Barat", alamat: "Jl. Soekarno-Hatta 748, Bandung", wilayah: "Jawa Barat", status: "Selesai", tglPlanSelesai: "2027-03-31", tglAktualSelesai: "2027-03-20" },
];
const ok = () => vi.fn<(site: unknown) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: true, message: "Lokasi disimpan." }));

describe("ProjectSites", () => {
  it("shows each site's status and the delay the system computed", () => {
    render(<ProjectSites sites={sites} contractSites={4} today="2027-04-10" canAdd={false} canEdit={false} onSave={ok()} />);
    const a = within(screen.getByTestId("site-a"));
    expect(a.getByTestId("status").textContent).toBe("Instalasi");
    expect(a.getByTestId("delay").textContent).toBe("10 hari");
    expect(within(screen.getByTestId("site-b")).getByTestId("delay").textContent).toBe("–");
    expect(screen.getByTestId("site-count").textContent).toBe("2 dari 4 lokasi kontrak terdaftar");
  });

  it("hides the add and edit controls from readers", () => {
    render(<ProjectSites sites={sites} contractSites={4} today="2027-04-10" canAdd={false} canEdit={false} onSave={ok()} />);
    expect(screen.queryByRole("button", { name: "Tambah lokasi" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ubah POLDA-JATIM-01" })).toBeNull();
  });

  it("lets the Project Manager register a site", async () => {
    const onSave = ok();
    render(<ProjectSites sites={sites} contractSites={4} today="2027-04-10" canAdd canEdit onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Tambah lokasi" }));
    fireEvent.change(screen.getByLabelText("Kode lokasi"), { target: { value: "POLDA-BALI-01" } });
    fireEvent.change(screen.getByLabelText("Nama lokasi"), { target: { value: "Polda Bali" } });
    fireEvent.change(screen.getByLabelText("Alamat"), { target: { value: "Jl. WR Supratman 7, Denpasar" } });
    fireEvent.change(screen.getByLabelText("Rencana selesai"), { target: { value: "2027-05-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Simpan lokasi" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ id: null, kode: "POLDA-BALI-01", nama: "Polda Bali", status: "Belum_Mulai", tglPlanSelesai: "2027-05-15" });
  });

  it("stops adding once every contract site is registered", () => {
    render(<ProjectSites sites={sites} contractSites={2} today="2027-04-10" canAdd canEdit onSave={ok()} />);
    expect(screen.getByRole("button", { name: "Tambah lokasi" })).toHaveProperty("disabled", true);
  });

  it("does not offer a hand-set status for a site whose status comes from its BAI", () => {
    render(<ProjectSites sites={sites} contractSites={4} today="2027-04-10" canAdd canEdit onSave={ok()} />);
    fireEvent.click(screen.getByRole("button", { name: "Ubah POLDA-JABAR-01" }));
    expect(screen.getByLabelText("Status")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    fireEvent.click(screen.getByRole("button", { name: "Ubah POLDA-JATIM-01" }));
    const options = [...(screen.getByLabelText("Status") as HTMLSelectElement).options].map((o) => o.value);
    expect(options).not.toContain("Selesai");
    expect(options).toContain("Terkendala");
  });
});
