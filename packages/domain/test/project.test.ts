import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import {
  FIELD_SITE_STATUSES,
  baiProblems,
  baiReturnProblems,
  bastProblems,
  rfsProblems,
  signoffProblems,
  statusAfterSite,
  type SiteBai,
  PROJECT_STATUSES,
  SITE_STATUSES,
  canOpenProject,
  canProject,
  delayDays,
  projectProgress,
  siteProblems,
  teamProblems,
  type ProjectTeam,
  type SiteInput,
} from "../src/project";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "SCM", parent: "PDMS" },
  { code: "ISO", parent: "PDMS" },
  { code: "MSO", parent: "PDMS" },
  { code: "FRM", parent: "DIR" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "PMO", entities: ["*"], ...over });

// Kamus Field B row 3: kode_site, contoh POLDA-JATIM-01.
const site: SiteInput = {
  kode: "POLDA-JATIM-01",
  nama: "Polda Jawa Timur",
  alamat: "Jl. Ahmad Yani 116, Surabaya",
  wilayah: "Jawa Timur",
  status: "Belum_Mulai",
  tglPlanSelesai: "2027-03-31",
};

const team: ProjectTeam = { pm: "pm", deliveryControl: "dc", projectAdmin: "pa" };
const project = { entity: "ESTRADA", team };

describe("statuses: Kamus Field A row 1 and B row 9", () => {
  it("adds Layanan and Garansi between Penagihan and Closing", () => {
    expect(PROJECT_STATUSES).toEqual(["Initiation", "Pengadaan_Barang", "Implementasi", "Penagihan", "Layanan", "Garansi", "Closing", "Drop"]);
  });

  it("lists the ten site statuses in order", () => {
    expect(SITE_STATUSES).toEqual(["Belum_Mulai", "Survei", "Staging", "Dikirim", "Instalasi", "Uji", "BAI_Terbit", "BAI_Terverifikasi", "Selesai", "Terkendala"]);
  });

  it("leaves the BAI statuses and Selesai to the BAI record, not to a hand-set status", () => {
    expect(FIELD_SITE_STATUSES).toEqual(["Belum_Mulai", "Survei", "Staging", "Dikirim", "Instalasi", "Uji", "Terkendala"]);
  });
});

describe("projectProgress: lokasi selesai dibagi total lokasi kontrak (Tahap Implementasi, catatan per site)", () => {
  it("counts 103 finished sites of a 206 kabupaten-kota contract as 50%", () => {
    const sites = [...Array.from({ length: 103 }, () => ({ status: "Selesai" as const })), ...Array.from({ length: 40 }, () => ({ status: "Instalasi" as const }))];
    const p = projectProgress(sites, 206);
    expect(p.done).toBe(103);
    expect(p.total).toBe(206);
    expect(p.registered).toBe(143);
    expect(p.pct.toFixed(2)).toBe("50.00");
  });

  it("divides by the contract's sites, not by the sites registered so far", () => {
    expect(projectProgress([{ status: "Selesai" }], 4).pct.toFixed(2)).toBe("25.00");
  });

  it("does not count a site whose BAI is only issued or verified", () => {
    expect(projectProgress([{ status: "BAI_Terbit" }, { status: "BAI_Terverifikasi" }], 2).done).toBe(0);
  });
});

describe("delayDays: dihitung sistem, tidak diketik (Kamus Field B row 12)", () => {
  it("is zero while the plan date has not passed", () => {
    expect(delayDays({ tglPlanSelesai: "2027-03-31", tglAktualSelesai: null }, "2027-03-31")).toBe(0);
  });

  it("counts days past the plan date for an unfinished site", () => {
    expect(delayDays({ tglPlanSelesai: "2027-03-31", tglAktualSelesai: null }, "2027-04-10")).toBe(10);
  });

  it("stops counting at the actual finish date", () => {
    expect(delayDays({ tglPlanSelesai: "2027-03-31", tglAktualSelesai: "2027-04-03" }, "2027-06-01")).toBe(3);
    expect(delayDays({ tglPlanSelesai: "2027-03-31", tglAktualSelesai: "2027-03-20" }, "2027-06-01")).toBe(0);
  });
});

describe("siteProblems: Kamus Field B", () => {
  const codes = (s: SiteInput, others: { kode: string }[] = [], contract = 10) => siteProblems(s, others, contract).map((p) => `${p.field}:${p.code}`);

  it("accepts a complete site", () => {
    expect(codes(site)).toEqual([]);
  });

  it("requires kode, nama, alamat and a valid plan date", () => {
    expect(codes({ ...site, kode: " ", nama: "", alamat: "", tglPlanSelesai: "2027-02-30" })).toEqual(["kode:required", "nama:required", "alamat:required", "tglPlanSelesai:invalid"]);
  });

  it("keeps kode_site unique per project, ignoring case and spacing", () => {
    expect(codes(site, [{ kode: " polda-jatim-01 " }])).toEqual(["kode:duplicate"]);
  });

  it("refuses more sites than the contract counts", () => {
    expect(codes(site, [{ kode: "A" }, { kode: "B" }], 2)).toEqual(["kode:over_contract"]);
  });

  it("refuses an invalid actual finish date", () => {
    expect(codes({ ...site, tglAktualSelesai: "31-03-2027" })).toEqual(["tglAktualSelesai:invalid"]);
  });

  it("refuses a status that only a BAI can set", () => {
    expect(codes({ ...site, status: "Selesai" })).toEqual(["status:not_manual"]);
  });
});

describe("canOpenProject: proyek dibuka setelah kontrak terbit (Tahap 1)", () => {
  it("opens a project only from a Closed Won deal", () => {
    expect(canOpenProject({ status: "CW" })).toBe(true);
    expect(canOpenProject({ status: "WB" })).toBe(false);
  });
});

describe("teamProblems: larangan rangkap peran (Kewenangan B)", () => {
  it("accepts three different people", () => {
    expect(teamProblems(team)).toEqual([]);
  });

  it("refuses a Delivery Control who is also the Project Admin: BAI_MAKER_CHECKER", () => {
    expect(teamProblems({ ...team, projectAdmin: "dc" })).toEqual(["BAI_MAKER_CHECKER"]);
  });

  it("refuses a Delivery Control who is also the Project Manager: SELF_VERIFICATION_NOT_ALLOWED", () => {
    expect(teamProblems({ ...team, pm: "dc" })).toEqual(["SELF_VERIFICATION_NOT_ALLOWED"]);
  });

  it("allows an incomplete team", () => {
    expect(teamProblems({ pm: "pm", deliveryControl: null, projectAdmin: null })).toEqual([]);
  });
});

describe("canProject: matriks peran (Kewenangan A)", () => {
  it("row 1: BCD opens the project, PDMS does not", () => {
    expect(canProject(actor({ orgUnit: "BCD" }), "open", { entity: "ESTRADA", team: null }, org)).toBe(true);
    expect(canProject(actor({ role: "division_owner", orgUnit: "PMO" }), "open", { entity: "ESTRADA", team: null }, org)).toBe(false);
    expect(canProject(actor({ orgUnit: "BCD", entities: ["MMT"] }), "open", { entity: "ESTRADA", team: null }, org)).toBe(false);
  });

  it("row 3: only the Head PMO, or a head above PMO, assigns the team", () => {
    expect(canProject(actor({ role: "default_owner", orgUnit: "PMO" }), "assign", project, org)).toBe(true);
    expect(canProject(actor({ role: "division_owner", orgUnit: "PDMS" }), "assign", project, org)).toBe(true);
    expect(canProject(actor({ role: "requestor", orgUnit: "PMO" }), "assign", project, org)).toBe(false);
    expect(canProject(actor({ role: "default_owner", orgUnit: "SCM" }), "assign", project, org)).toBe(false);
  });

  it("row 7: the Project Manager registers sites; the Project Admin updates them", () => {
    expect(canProject(actor({ userId: "pm" }), "site.add", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "site.add", project, org)).toBe(false);
    expect(canProject(actor({ userId: "pm" }), "site.edit", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "site.edit", project, org)).toBe(true);
    expect(canProject(actor({ userId: "dc" }), "site.edit", project, org)).toBe(false);
    expect(canProject(actor({ role: "default_owner", userId: "head" }), "site.edit", project, org)).toBe(false);
  });

  it("row 7: PDMS, BCD, Finance, Direktur and Auditor read; others do not", () => {
    for (const unit of ["PMO", "SCM", "ISO", "MSO", "BCD"]) expect(canProject(actor({ orgUnit: unit }), "view", project, org)).toBe(true);
    for (const role of ["finance", "director", "auditor"] as const) expect(canProject(actor({ role, orgUnit: "FRM" }), "view", project, org)).toBe(true);
    expect(canProject(actor({ orgUnit: "FRM" }), "view", project, org)).toBe(false);
  });

  it("keeps every action inside the user's entities", () => {
    expect(canProject(actor({ userId: "pm", entities: ["MMT"] }), "view", project, org)).toBe(false);
    expect(canProject(actor({ userId: "pm", entities: ["MMT"] }), "site.add", project, org)).toBe(false);
  });

  it("lets a reader open the list before any project is chosen", () => {
    expect(canProject(actor({ orgUnit: "MSO" }), "view", null, org)).toBe(true);
    expect(canProject(actor({ orgUnit: "FRM" }), "view", null, org)).toBe(false);
  });
});

// Tahap Implementasi B rows 19-21: Delivery Control collects, Project Admin compiles, Assurance verifies.
const bai: SiteBai = { nomor: "BAI/POLDA-JATIM/001", tanggal: "2027-03-28", evidence: "Drive/SBST/POLDA-JATIM-01", collectedBy: "dc", compiledBy: null, verifiedBy: null, spotCheckPassed: null };

describe("baiProblems: tiga tangan, satu dokumen (Kewenangan B, BAI_MAKER_CHECKER)", () => {
  const input = { nomor: bai.nomor, tanggal: bai.tanggal, evidence: bai.evidence };

  it("collect: records the BAI of a site that has been tested, and moves it to BAI_Terbit", () => {
    expect(baiProblems("collect", { status: "Uji", ujiPetik: false, bai: null }, "dc", input)).toEqual({ problems: [], next: "BAI_Terbit" });
  });

  it("collect: refuses a site that is not yet at Uji", () => {
    expect(baiProblems("collect", { status: "Instalasi", ujiPetik: false, bai: null }, "dc", input).problems).toEqual(["wrong_status"]);
  });

  it("collect: requires the number, a valid date and the evidence (Kamus Field B rows 13, 14, 18)", () => {
    expect(baiProblems("collect", { status: "Uji", ujiPetik: false, bai: null }, "dc", { nomor: " ", tanggal: "28/03/2027", evidence: "" }).problems).toEqual(["nomor", "tanggal", "evidence"]);
  });

  it("compile: the Project Admin compiles a collected BAI, moving it to BAI_Terverifikasi", () => {
    expect(baiProblems("compile", { status: "BAI_Terbit", ujiPetik: false, bai }, "pa")).toEqual({ problems: [], next: "BAI_Terverifikasi" });
  });

  it("compile: refuses the person who collected it", () => {
    expect(baiProblems("compile", { status: "BAI_Terbit", ujiPetik: false, bai }, "dc").problems).toEqual(["BAI_MAKER_CHECKER"]);
  });

  it("compile: a sample site needs its uji petik passed (Tahap B row 18)", () => {
    expect(baiProblems("compile", { status: "BAI_Terbit", ujiPetik: true, bai }, "pa").problems).toEqual(["spot_check"]);
    expect(baiProblems("compile", { status: "BAI_Terbit", ujiPetik: true, bai }, "pa", { spotCheckPassed: true }).problems).toEqual([]);
  });

  it("verify: Assurance verifies a compiled BAI and the site becomes Selesai", () => {
    expect(baiProblems("verify", { status: "BAI_Terverifikasi", ujiPetik: false, bai: { ...bai, compiledBy: "pa" } }, "as")).toEqual({ problems: [], next: "Selesai" });
  });

  it("verify: refuses whoever collected or compiled it", () => {
    const site = { status: "BAI_Terverifikasi" as const, ujiPetik: false, bai: { ...bai, compiledBy: "pa" } };
    expect(baiProblems("verify", site, "dc").problems).toEqual(["BAI_MAKER_CHECKER"]);
    expect(baiProblems("verify", site, "pa").problems).toEqual(["BAI_MAKER_CHECKER"]);
  });

  it("verify: refuses a BAI that is not compiled yet", () => {
    expect(baiProblems("verify", { status: "BAI_Terbit", ujiPetik: false, bai }, "as").problems).toEqual(["wrong_status"]);
  });
});

describe("baiReturnProblems: BAI dikembalikan dengan catatan", () => {
  it("returns a collected or compiled BAI to Uji with a note", () => {
    expect(baiReturnProblems({ status: "BAI_Terbit" }, "Tanda tangan PIC belum ada")).toEqual([]);
    expect(baiReturnProblems({ status: "BAI_Terverifikasi" }, "Jumlah perangkat tidak sesuai kontrak")).toEqual([]);
  });

  it("requires a note and a BAI in progress", () => {
    expect(baiReturnProblems({ status: "BAI_Terbit" }, "  ")).toEqual(["note"]);
    expect(baiReturnProblems({ status: "Selesai" }, "terlambat")).toEqual(["wrong_status"]);
  });
});

describe("statusAfterSite: proyek masuk Implementasi saat lokasi pertama dikerjakan (Tahap A row 3)", () => {
  it("moves an Initiation project to Implementasi once a site is past survey", () => {
    expect(statusAfterSite("Initiation", "Staging")).toBe("Implementasi");
    expect(statusAfterSite("Pengadaan_Barang", "Instalasi")).toBe("Implementasi");
  });

  it("leaves the project alone during survey and after Implementasi", () => {
    expect(statusAfterSite("Initiation", "Survei")).toBe("Initiation");
    expect(statusAfterSite("Penagihan", "Uji")).toBe("Penagihan");
  });
});

describe("rfsProblems: seluruh lokasi terpasang dan lulus uji (Serah Terima E gate 1)", () => {
  const tested = (n: number) => Array.from({ length: n }, () => ({ status: "Uji" as const }));

  it("allows RFS when every contract site is tested or further", () => {
    expect(rfsProblems({ contractSites: 3, sites: [...tested(2), { status: "Selesai" }] })).toEqual([]);
  });

  it("refuses while contract sites are not all registered", () => {
    expect(rfsProblems({ contractSites: 4, sites: tested(3) })).toEqual(["sites_missing"]);
  });

  it("refuses while a site is still being installed or is blocked", () => {
    expect(rfsProblems({ contractSites: 2, sites: [...tested(1), { status: "Instalasi" }] })).toEqual(["sites_untested"]);
    expect(rfsProblems({ contractSites: 2, sites: [...tested(1), { status: "Terkendala" }] })).toEqual(["sites_untested"]);
  });
});

describe("bastProblems: jumlah BAI terverifikasi sama dengan jumlah lokasi kontrak (Serah Terima E gates 2-4)", () => {
  const done = (n: number) => Array.from({ length: n }, () => ({ status: "Selesai" as const }));

  it("allows BAST once RFS is declared and every contract site has a verified BAI", () => {
    expect(bastProblems({ contractSites: 206, rfsOn: "2027-06-30", sites: done(206) })).toEqual([]);
  });

  it("refuses with 205 of 206 BAI verified", () => {
    expect(bastProblems({ contractSites: 206, rfsOn: "2027-06-30", sites: [...done(205), { status: "BAI_Terverifikasi" }] })).toEqual(["bai_incomplete"]);
  });

  it("refuses before RFS", () => {
    expect(bastProblems({ contractSites: 1, rfsOn: null, sites: done(1) })).toEqual(["rfs"]);
  });
});

describe("signoffProblems: pengaju tidak mengesahkan sendiri", () => {
  it("requires a valid date and, for BAST, its number", () => {
    expect(signoffProblems("rfs", { on: "2027-06-31" })).toEqual(["date"]);
    expect(signoffProblems("bast", { on: "2027-07-05", number: " " })).toEqual(["number"]);
    expect(signoffProblems("bast", { on: "2027-07-05", number: "BAST/SBST/2027/001" })).toEqual([]);
  });

  it("refuses the proposer as approver", () => {
    expect(signoffProblems("rfs", { on: "2027-06-30" }, { proposedBy: "pm", approver: "pm" })).toEqual(["SELF_APPROVAL_NOT_ALLOWED"]);
    expect(signoffProblems("rfs", { on: "2027-06-30" }, { proposedBy: "pm", approver: "head" })).toEqual([]);
  });
});

describe("canProject: BAI, RFS dan BAST (Kewenangan A rows 17-19, 22-24)", () => {
  it("row 17: Delivery Control collects the BAI", () => {
    expect(canProject(actor({ userId: "dc" }), "bai.collect", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "bai.collect", project, org)).toBe(false);
  });

  it("row 18: the Project Admin compiles it", () => {
    expect(canProject(actor({ userId: "pa" }), "bai.compile", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "bai.compile", project, org)).toBe(false);
  });

  it("row 19: Assurance, in Commercial Business, verifies it for billing; PDMS only reads", () => {
    expect(canProject(actor({ orgUnit: "BCD", userId: "as" }), "bai.verify", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "bai.verify", project, org)).toBe(false);
    expect(canProject(actor({ role: "default_owner", userId: "head" }), "bai.verify", project, org)).toBe(false);
    expect(canProject(actor({ orgUnit: "BCD", entities: ["MMT"] }), "bai.verify", project, org)).toBe(false);
  });

  it("row 22: the Project Manager declares RFS and the Head PMO approves it", () => {
    expect(canProject(actor({ userId: "pm" }), "rfs.declare", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "rfs.declare", project, org)).toBe(false);
    expect(canProject(actor({ role: "default_owner", userId: "head" }), "rfs.approve", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "rfs.approve", project, org)).toBe(false);
  });

  it("rows 23-24: the Project Admin prepares the BAST and the Head PMO approves it", () => {
    expect(canProject(actor({ userId: "pa" }), "bast.prepare", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "bast.prepare", project, org)).toBe(false);
    expect(canProject(actor({ role: "division_owner", orgUnit: "PDMS", userId: "head" }), "bast.approve", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "bast.approve", project, org)).toBe(false);
  });
});
