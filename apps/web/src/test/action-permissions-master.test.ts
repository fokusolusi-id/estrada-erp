import { beforeEach, describe, expect, it, vi } from "vitest";
import { everyRole, outcome, queued, rows, signInAs } from "./action-harness";
import { saveCostCenter, saveCustomer, saveEmployee, savePartner, saveProduct } from "@/app/(app)/master/actions";

// Plan A5 exit: each steward can edit only their master. Called as every role against a database that refuses writes.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@estrada/db", async () => {
  const h = await import("./action-harness");
  return { db: h.fakeDb(), schema: h.fakeSchema() };
});
vi.mock("@/lib/session", async () => {
  const h = await import("./action-harness");
  return { requireUser: async () => ({ id: h.session.current.userId, name: "Uji", email: "uji@estrada.test", actor: h.session.current }) };
});
vi.mock("@/lib/workflow", async () => {
  const h = await import("./action-harness");
  return { loadOrg: async () => h.ORG };
});

const customer = { nickname: "Uji", legalName: "PT Uji", segment: "Telco", npwp: "01.000.013.1-093.000", active: true };
const partner = { name: "PT Mitra Uji", category: "Distributor", active: true };
const product = { partnerId: "Mitra-001", category: "Hardware", type: "Router", brand: "Ransnet", active: true };

const employee = { nip: "E1", name: "Uji", email: "", entityCode: "ESTRADA", unitCode: "", position: "Staff", title: "Staff", employmentStatus: "Active", active: true };

const MASTERS = [
  { name: "saveCustomer", unit: "BCD", run: () => saveCustomer(null, customer), refusal: "Master Customer diubah oleh Sales (BCD)." },
  { name: "savePartner", unit: "SCM", run: () => savePartner(null, partner), refusal: "Master Mitra diubah oleh SCM." },
  { name: "saveProduct", unit: "SCM", run: () => saveProduct(null, product), refusal: "Master Produk Mitra diubah oleh SCM." },
  { name: "saveEmployee", unit: "HCM", run: () => saveEmployee(null, employee), refusal: "Master Karyawan diubah oleh HCM." },
];

beforeEach(() => {
  rows.current = [];
  queued.current = [];
});

describe.each(MASTERS)("$name", ({ name, unit, run, refusal }) => {
  it("lets the steward past the check", async () => {
    signInAs("requestor", { orgUnit: unit });
    if (name === "saveProduct") queued.current = [[{ id: "Mitra-001" }]];
    expect(await outcome(run)).toHaveProperty("pastGate");
  });

  it("lets Admin past the check", async () => {
    signInAs("admin");
    if (name === "saveProduct") queued.current = [[{ id: "Mitra-001" }]];
    expect(await outcome(run)).toHaveProperty("pastGate");
  });

  it.each(everyRole.filter((r) => r !== "admin").map((r) => [r]))("refuses %s outside the steward unit", async (role) => {
    signInAs(role, { orgUnit: "FRM" });
    expect(await outcome(run)).toEqual({ message: refusal });
  });
});

describe("master rules before any write", () => {
  it("BR-MD-004: refuses a customer whose NPWP another customer holds", async () => {
    signInAs("requestor", { orgUnit: "BCD" });
    rows.current = [{ id: "Cust-001", npwp: "010000131093000" }];
    expect(await outcome(() => saveCustomer(null, customer))).toEqual({ message: "NPWP sudah dipakai Cust-001; customer tidak boleh ganda." });
  });

  it("refuses a missing name", async () => {
    signInAs("requestor", { orgUnit: "BCD" });
    expect(await outcome(() => saveCustomer(null, { ...customer, legalName: " " }))).toEqual({ message: "Nama customer wajib diisi." });
  });

  it("refuses a product the partner already lists", async () => {
    signInAs("requestor", { orgUnit: "SCM" });
    queued.current = [[{ id: "Mitra-001" }], [{ ...product, id: "Produk-001", brand: "ransnet" }]];
    expect(await outcome(() => saveProduct(null, product))).toEqual({ message: "Produk ini sudah ada pada mitra tersebut (Produk-001)." });
  });

  it("refuses a NIP or an email another employee holds", async () => {
    signInAs("admin");
    rows.current = [{ nip: "E1", email: "a@estrada.test" }];
    expect(await outcome(() => saveEmployee(null, employee))).toEqual({ message: "NIP E1 sudah dipakai." });
    expect(await outcome(() => saveEmployee(null, { ...employee, nip: "E2", email: "A@estrada.test" }))).toEqual({ message: "Email sudah dipakai karyawan E1." });
  });

  it("refuses editing a record that does not exist", async () => {
    signInAs("requestor", { orgUnit: "SCM" });
    expect(await outcome(() => savePartner("Mitra-999", partner))).toEqual({ message: "Data tidak ditemukan." });
  });
});

describe("saveCostCenter: Finance and Admin set approval limits", () => {
  const input = { functionGroup: "Delivery", approvalLimit: "2.000.000.000" };

  it.each(everyRole.map((r) => [r]))("as %s", async (role) => {
    signInAs(role);
    rows.current = [{ code: "SCM" }];
    const out = await outcome(() => saveCostCenter("SCM", input));
    if (role === "finance" || role === "admin") expect(out).toHaveProperty("pastGate");
    else expect(out).toEqual({ message: "Limit cost center diubah oleh Finance." });
  });

  it("refuses a limit it cannot read", async () => {
    signInAs("finance");
    expect(await outcome(() => saveCostCenter("SCM", { ...input, approvalLimit: "dua miliar" }))).toEqual({ message: "Limit persetujuan tidak terbaca." });
  });
});
