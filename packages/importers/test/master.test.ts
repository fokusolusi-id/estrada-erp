import { describe, expect, it } from "vitest";
import { codesOutsideFile, parseCoaStructured, parseEmployees } from "../src/index";

const UNITS = [
  { code: "FRM", aliases: [] },
  { code: "PDMS", aliases: [] },
  { code: "SCM", aliases: [] },
  { code: "PST", aliases: [] },
  { code: "BCD", aliases: ["CBD", "SPA", "Sales"] },
];

// "COA Structured RKA 2027", sheet "Sheet2": two title rows, header on row 3, the segment legend to the right.
const COA_HEADER = ["account_code", "account_name", "level", "parent_code", "account_type", "normal_balance", "statement", "is_postable", "is_segmented", "path", "note", "requestor", "budget_owner", "rka_category", "", "", "", "", "segment_code", "segment_name", "description"];
const COA = [
  ["COA STRUCTURED – Referensi (impor dari COA Master.xlsx)"],
  ["MASTER REFERENSI UTAMA COA – dipakai form RKA"],
  COA_HEADER,
  ["4000", "Pendapatan", "1", "", "Revenue", "Credit", "Income Statement", "FALSE", "FALSE", "Pendapatan", "", "CBD", "CBD", "Revenue", "", "", "", "", "S1", "Government Business / APH", "Government Business  / Aparat Penegak Hukum"],
  ["4110", "Router Gateway", "3", "4000", "Revenue", "Credit", "Income Statement", "TRUE", "TRUE", "Pendapatan > Router Gateway", "", "CBD", "CBD", "Revenue", "", "", "", "", "S2", "Territory Business / Pemda", "Territory Business / Pemerintah Daerah"],
  ["5100", "Biaya Pembelian Perangkat Keras", "2", "", "COGS", "Debit", "Income Statement", "TRUE", "TRUE", "", "", "PDMS,PST", "PDMS, SCM", "COGS", "", "", "", "", "", "", ""],
  ["7000", "Pendapatan dan Beban Lain-lain", "1", "", "Other", "", "Income Statement", "FALSE", "FALSE", "", "", "FRM", "FRM", "OTHERS"],
  ["6000", "Beban Operasional", "1", "", "Operating Expense", "Debit", "Income Statement", "FALSE", "FALSE", "", "", "", "", "OPEX"],
  ["8100", "Beban Pajak Penghasilan", "2", "", "Tax", "Debit", "Income Statement", "TRUE", "FALSE", "", "", "FRM", "FRM", "TAX"],
  ["1591", "Akumulasi Penyusutan Bangunan", "3", "", "Contra Asset", "Credit", "Balance Sheet", "TRUE", "FALSE", "", "Kontra akun untuk 1510", "FRM", "FRM", "CONTRA ASSET"],
  ["1510", "Bangunan", "3", "", "Fixed Asset", "Debit", "Balance Sheet", "TRUE", "FALSE", "", "", "FRM", "FRM", "CAPEX"],
];

describe("parseCoaStructured", () => {
  const { accounts, segments } = parseCoaStructured(COA, UNITS);
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  it("keeps every account with its place in the tree and its ledger attributes", () => {
    expect(byCode.get("4110")).toEqual({
      code: "4110",
      name: "Router Gateway",
      level: 3,
      parentCode: "4000",
      accountType: "Revenue",
      normalBalance: "credit",
      statement: "income_statement",
      postable: true,
      segmented: true,
      note: null,
      category: "Revenue",
      center: "revenue",
      requestorUnits: ["BCD"],
      ownerUnits: ["BCD"],
      defaultOwnerUnit: "BCD",
    });
    expect(accounts).toHaveLength(8);
  });

  it("splits several requestors and owners, and takes the first owner as the default", () => {
    expect(byCode.get("5100")).toMatchObject({ requestorUnits: ["PDMS", "PST"], ownerUnits: ["PDMS", "SCM"], defaultOwnerUnit: "PDMS", center: "cost" });
    expect(byCode.get("6000")).toMatchObject({ requestorUnits: [], ownerUnits: [], defaultOwnerUnit: null });
  });

  it("maps rka_category: P&L and CAPEX as RKA uses them, TAX on its own, every other balance-sheet group to BALANCE_SHEET", () => {
    expect(byCode.get("8100")!.category).toBe("TAX");
    expect(byCode.get("1510")!.category).toBe("CAPEX");
    expect(byCode.get("1591")).toMatchObject({ category: "BALANCE_SHEET", statement: "balance_sheet", note: "Kontra akun untuk 1510" });
  });

  it("leaves a blank normal balance blank (7000 has none)", () => {
    expect(byCode.get("7000")!.normalBalance).toBeNull();
  });

  it("reads the segment legend S1..S4", () => {
    expect(segments).toEqual([
      { code: "S1", name: "Government Business / APH", description: "Government Business / Aparat Penegak Hukum" },
      { code: "S2", name: "Territory Business / Pemda", description: "Territory Business / Pemerintah Daerah" },
    ]);
  });

  it("stops on an owner unit it cannot place, a parent missing from the file, or an unknown category", () => {
    const row = (over: Record<number, string>) => [...COA.slice(0, 3), COA_HEADER.map((_, i) => over[i] ?? COA[5]![i] ?? "")];
    expect(() => parseCoaStructured(row({ 12: "XYZ" }), UNITS)).toThrow(/5100.*XYZ/);
    expect(() => parseCoaStructured(row({ 3: "5000" }), UNITS)).toThrow(/5100.*5000/);
    expect(() => parseCoaStructured(row({ 13: "MISC" }), UNITS)).toThrow(/5100.*MISC/);
  });
});

// "Data Karyawan Estrada Group", sheet "Data Karyawan (Okt)": three note rows, header on row 4.
const EMP_HEADER = ["Employee NIP", "Employee Name", "Employee Email", "Fungsi", "Kode", "Company Code", "Divisi", "Department", "Posisi", "Jabatan", "Cost Center Code", "Employment Status", "Join Date", "Direct Manager NIP", "Phone", "Photo URL", "Notes", "Source Note"];
const emp = (over: Partial<Record<(typeof EMP_HEADER)[number], string>>) => {
  const base: Record<string, string> = { "Employee NIP": "E20190077", "Employee Name": "Kamal Abdillah", "Employee Email": "kamal@estrada.co.id", Fungsi: "Finance", Kode: "F9", "Company Code": "ESTRADA", Divisi: "Finance & Risk Management", Department: "-", Posisi: "Head", Jabatan: "Division of Finance & Risk Management", "Employment Status": "Active", "Join Date": "01 March 2019", "Direct Manager NIP": "-", Phone: "-", Notes: "-", ...over };
  return EMP_HEADER.map((h) => base[h] ?? "");
};
const EMP = (rows: string[][]) => [["EMPLOYEE MASTER - DATA TEMPLATE"], ["Isi data mulai baris 5."], [], EMP_HEADER, ...rows];
const CTX = { entities: ["ESTRADA", "DJALU"] };

describe("parseEmployees", () => {
  it("reads one employee per NIP, with the most specific org unit and the join date as ISO", () => {
    const [e] = parseEmployees(EMP([emp({})]), CTX);
    expect(e).toEqual({
      nip: "E20190077",
      name: "Kamal Abdillah",
      email: "kamal@estrada.co.id",
      entityCode: "ESTRADA",
      unitCode: "FRM",
      position: "Head",
      title: "Division of Finance & Risk Management",
      functionCodes: ["F9"],
      employmentStatus: "Active",
      active: true,
      joinedOn: "2019-03-01",
      managerNip: null,
      phone: null,
      notes: null,
    });
  });

  it("places departments under their division, trimming stray spaces", () => {
    const [a, b, c] = parseEmployees(
      EMP([
        emp({ "Employee NIP": "E1", "Employee Email": "a@x.id", Divisi: "Commercial Business ", Department: "Enterprise Business" }),
        emp({ "Employee NIP": "E2", "Employee Email": "b@x.id", Divisi: "Project Delivery & Managed Services", Department: "Managed Service Operation" }),
        emp({ "Employee NIP": "E3", "Employee Email": "c@x.id", Divisi: "Project Implementation & Technical Support", Department: "Project Implementation & Technical Support", "Company Code": "DJALU" }),
      ]),
      CTX,
    );
    expect([a!.unitCode, b!.unitCode, c!.unitCode]).toEqual(["BCD-ENT", "MSO", "PITS"]);
  });

  it("splits several function codes, and leaves a missing email or join date empty", () => {
    const [e] = parseEmployees(EMP([emp({ Kode: "F2, F3, F8", "Employee Email": "-", "Join Date": "" })]), CTX);
    expect(e).toMatchObject({ functionCodes: ["F2", "F3", "F8"], email: null, joinedOn: null });
  });

  it("reads Indonesian month names too, and lower-cases emails", () => {
    const [e] = parseEmployees(EMP([emp({ "Join Date": "15 Agustus 2024", "Employee Email": "Rini.Andriani@Estrada.co.id" })]), CTX);
    expect(e).toMatchObject({ joinedOn: "2024-08-15", email: "rini.andriani@estrada.co.id" });
  });

  it("collapses a row repeated word for word (E20240445 appears twice)", () => {
    expect(parseEmployees(EMP([emp({}), emp({})]), CTX)).toHaveLength(1);
  });

  it("stops on a NIP or email used by two different people, an unknown company or unit, or a date it cannot read", () => {
    expect(() => parseEmployees(EMP([emp({}), emp({ "Employee Name": "Someone Else" })]), CTX)).toThrow(/E20190077/);
    expect(() => parseEmployees(EMP([emp({}), emp({ "Employee NIP": "E2" })]), CTX)).toThrow(/kamal@estrada\.co\.id/);
    expect(() => parseEmployees(EMP([emp({ "Company Code": "PAS" })]), CTX)).toThrow(/PAS/);
    expect(() => parseEmployees(EMP([emp({ Divisi: "Marketing" })]), CTX)).toThrow(/Marketing/);
    expect(() => parseEmployees(EMP([emp({ "Join Date": "2019/03/01" })]), CTX)).toThrow(/2019\/03\/01/);
  });
});

describe("parseEmployees from the workbook (Data Karyawan Estrada Group)", () => {
  it("reads a join date Excel stored as a date", () => {
    const cols = ["Employee NIP", "Employee Name", "Employee Email", "Kode", "Company Code", "Divisi", "Department", "Posisi", "Jabatan", "Employment Status", "Join Date", "Direct Manager NIP", "Phone", "Notes"];
    const row = ["E1", "Uji", "", "F1", "ESTRADA", "BOD", "", "Staff", "Staff", "Active", new Date("2015-04-01T00:00:00Z"), "", "", ""];
    expect(parseEmployees([cols, row], { entities: ["ESTRADA"] })[0]!.joinedOn).toBe("2015-04-01");
  });
});

describe("codesOutsideFile (client: use only COA Structured RKA 2027)", () => {
  it("removes unused codes the file lacks and retires the ones still in use", () => {
    const existing = ["4110", "5100-1", "1615", "9999"];
    expect(codesOutsideFile(existing, ["4110"], new Set(["5100-1", "1615"]))).toEqual({ remove: ["9999"], retire: ["1615", "5100-1"] });
  });
});
