import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import {
  FIELD_SITE_STATUSES,
  BAI_TARGETS,
  baiKpi,
  baiTimeliness,
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
  contractSitesProblems,
  dropProblems,
  telkomProblems,
  siteDeleteProblems,
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

describe("siteDeleteProblems: lokasi salah daftar boleh dihapus selama belum dikerjakan", () => {
  it("allows deleting a site that has not started or is only surveyed, in a project still being delivered", () => {
    expect(siteDeleteProblems({ status: "Belum_Mulai", bai: null }, { status: "Initiation" })).toEqual([]);
    expect(siteDeleteProblems({ status: "Survei", bai: null }, { status: "Implementasi" })).toEqual([]);
  });

  it("refuses a site that has been worked on: it is evidence, not a mistake", () => {
    for (const status of ["Staging", "Dikirim", "Instalasi", "Uji", "BAI_Terbit", "BAI_Terverifikasi", "Selesai", "Terkendala"] as const) {
      expect(siteDeleteProblems({ status, bai: null }, { status: "Implementasi" })).toEqual(["worked_on"]);
    }
  });

  it("refuses a site that carries a BAI, even if it was returned to an earlier status", () => {
    const bai = { nomor: "BAI/1", tanggal: "2027-03-28", evidence: "x", collectedBy: "dc", compiledBy: null, verifiedBy: null, spotCheckPassed: null };
    expect(siteDeleteProblems({ status: "Survei", bai }, { status: "Implementasi" })).toEqual(["worked_on"]);
  });

  it("refuses once the project is past Implementasi", () => {
    expect(siteDeleteProblems({ status: "Belum_Mulai", bai: null }, { status: "Penagihan" })).toEqual(["project_closed_in"]);
    expect(siteDeleteProblems({ status: "Belum_Mulai", bai: null }, { status: "Garansi" })).toEqual(["project_closed_in"]);
  });
});

describe("contractSitesProblems: perubahan jumlah lokasi kontrak (change order)", () => {
  const ok = { status: "Implementasi" as const, bastOn: null, contractSites: 10 };

  it("accepts a new count not below the sites already registered, with a reason", () => {
    expect(contractSitesProblems(ok, 8, 12, "Addendum kontrak: tambah 2 lokasi")).toEqual([]);
    expect(contractSitesProblems(ok, 8, 8, "Addendum kontrak: kurangi 2 lokasi")).toEqual([]);
  });

  it("refuses a count that is not a positive whole number, or is unchanged", () => {
    expect(contractSitesProblems(ok, 0, 0, "x")).toEqual(["count"]);
    expect(contractSitesProblems(ok, 0, 2.5, "x")).toEqual(["count"]);
    expect(contractSitesProblems(ok, 0, 10, "x")).toEqual(["unchanged"]);
  });

  it("refuses a count below the sites already registered", () => {
    expect(contractSitesProblems(ok, 8, 7, "x")).toEqual(["below_registered"]);
  });

  it("requires the reason", () => {
    expect(contractSitesProblems(ok, 8, 12, "  ")).toEqual(["reason"]);
  });

  it("refuses once the BAST is approved, or the project is closed", () => {
    expect(contractSitesProblems({ ...ok, bastOn: "2027-07-05", status: "Penagihan" }, 8, 12, "x")).toEqual(["locked"]);
    expect(contractSitesProblems({ ...ok, status: "Closing" }, 8, 12, "x")).toEqual(["locked"]);
  });
});

describe("canProject: menghapus lokasi dan mengubah jumlah lokasi kontrak", () => {
  it("the Project Manager deletes a site, like registering one", () => {
    expect(canProject(actor({ userId: "pm" }), "site.delete", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "site.delete", project, org)).toBe(false);
  });

  it("BCD changes the contract count: it owns the contract (Kamus Field domain SALES_ASSURANCE)", () => {
    expect(canProject(actor({ orgUnit: "BCD" }), "contract.change", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "contract.change", project, org)).toBe(false);
    expect(canProject(actor({ orgUnit: "BCD", entities: ["MMT"] }), "contract.change", project, org)).toBe(false);
  });
});

// Tahap Implementasi B rows 19-21 and section C: 7 days to collect, 5 to compile, 3 to verify.
const timed = (over: Partial<SiteBai> = {}): SiteBai => ({ ...bai, tanggal: "2027-03-01", collectedOn: "2027-03-05", compiledOn: "2027-03-08", verifiedOn: "2027-03-10", ...over });

describe("baiTimeliness: berapa hari tiap langkah BAI, dibanding targetnya", () => {
  it("has the targets of the job descriptions", () => {
    expect(BAI_TARGETS).toEqual({ collect: 7, compile: 5, verify: 3 });
  });

  it("counts each step from the one before: BAI date, collected, compiled", () => {
    expect(baiTimeliness(timed(), "2027-04-01")).toEqual({
      collect: { days: 4, target: 7, state: "on_time" },
      compile: { days: 3, target: 5, state: "on_time" },
      verify: { days: 2, target: 3, state: "on_time" },
    });
  });

  it("calls a step late past its target, and on time on the target day itself", () => {
    const t = baiTimeliness(timed({ collectedOn: "2027-03-08", compiledOn: "2027-03-14", verifiedOn: "2027-03-18" }), "2027-04-01");
    expect(t.collect).toEqual({ days: 7, target: 7, state: "on_time" });
    expect(t.compile).toEqual({ days: 6, target: 5, state: "late" });
    expect(t.verify).toEqual({ days: 4, target: 3, state: "late" });
  });

  it("measures an unfinished step up to today: still waiting inside the target, or already late", () => {
    const open = timed({ compiledOn: null, verifiedOn: null });
    expect(baiTimeliness(open, "2027-03-09").compile).toEqual({ days: 4, target: 5, state: "waiting" });
    expect(baiTimeliness(open, "2027-03-20").compile).toEqual({ days: 15, target: 5, state: "late_open" });
    expect(baiTimeliness(open, "2027-03-20").verify).toBeNull();
  });

  it("has nothing to measure without a BAI", () => {
    expect(baiTimeliness(null, "2027-04-01")).toEqual({ collect: null, compile: null, verify: null });
  });
});

describe("baiKpi: ketepatan waktu per pemegang langkah", () => {
  const sites = [
    { bai: timed() },
    { bai: timed({ collectedOn: "2027-03-12", compiledOn: "2027-03-15", verifiedOn: "2027-03-17" }) },
    { bai: timed({ compiledOn: null, verifiedOn: null }) },
    { bai: null },
  ];

  it("counts per step how many were on time, late (finished or still open) and waiting", () => {
    const k = baiKpi(sites, "2027-03-20");
    expect(k.collect).toEqual({ total: 3, onTime: 2, late: 1, waiting: 0, pct: 66.7, averageDays: 6.3 });
    expect(k.compile).toEqual({ total: 3, onTime: 2, late: 1, waiting: 0, pct: 66.7, averageDays: 3 });
    expect(k.verify).toEqual({ total: 2, onTime: 2, late: 0, waiting: 0, pct: 100, averageDays: 2 });
  });

  it("leaves the percentage empty when nothing is due yet", () => {
    expect(baiKpi([{ bai: null }], "2027-03-20").collect).toEqual({ total: 0, onTime: 0, late: 0, waiting: 0, pct: null, averageDays: null });
  });

  it("leaves steps still inside their target out of the percentage", () => {
    const k = baiKpi([{ bai: timed({ compiledOn: null, verifiedOn: null }) }], "2027-03-09");
    expect(k.compile).toEqual({ total: 1, onTime: 0, late: 0, waiting: 1, pct: null, averageDays: null });
  });
});

describe("dropProblems: menghentikan proyek (status Drop)", () => {
  it("allows dropping a project before its BAST is approved, with a reason", () => {
    expect(dropProblems({ status: "Initiation", bastOn: null }, "Kontrak dibatalkan pelanggan")).toEqual([]);
    expect(dropProblems({ status: "Implementasi", bastOn: null }, "Kontrak dibatalkan pelanggan")).toEqual([]);
  });

  it("requires the reason", () => {
    expect(dropProblems({ status: "Implementasi", bastOn: null }, " ")).toEqual(["reason"]);
  });

  it("refuses once the BAST is approved, billing has started and a project cannot simply be dropped", () => {
    expect(dropProblems({ status: "Penagihan", bastOn: "2027-07-05" }, "x")).toEqual(["locked"]);
    expect(dropProblems({ status: "Layanan", bastOn: "2027-07-05" }, "x")).toEqual(["locked"]);
  });

  it("refuses a project already closed or dropped", () => {
    expect(dropProblems({ status: "Closing", bastOn: null }, "x")).toEqual(["locked"]);
    expect(dropProblems({ status: "Drop", bastOn: null }, "x")).toEqual(["locked"]);
  });
});

describe("canProject: a dropped or closed project is read-only", () => {
  it("lets everyone read it and nobody change it", () => {
    for (const status of ["Drop", "Closing"] as const) {
      const p = { ...project, status };
      expect(canProject(actor({ userId: "pm" }), "view", p, org)).toBe(true);
      expect(canProject(actor({ userId: "pm" }), "site.add", p, org)).toBe(false);
      expect(canProject(actor({ userId: "pa" }), "site.edit", p, org)).toBe(false);
      expect(canProject(actor({ role: "default_owner", orgUnit: "PMO" }), "assign", p, org)).toBe(false);
    }
  });

  it("row 35: the Head PMO, or a head above PMO, drops a project", () => {
    expect(canProject(actor({ role: "default_owner", orgUnit: "PMO" }), "drop", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pm" }), "drop", project, org)).toBe(false);
    expect(canProject(actor({ role: "default_owner", orgUnit: "PMO" }), "drop", { ...project, status: "Drop" }, org)).toBe(false);
  });
});

describe("BARD dan BAUT untuk pelanggan skema TELKOM (Tahap Implementasi B row 25)", () => {
  const done = (n: number) => Array.from({ length: n }, () => ({ status: "Selesai" as const }));
  const base = { contractSites: 2, rfsOn: "2027-06-30", sites: done(2) };

  it("is not asked of a project outside the TELKOM scheme", () => {
    expect(bastProblems(base)).toEqual([]);
    expect(bastProblems({ ...base, telkomScheme: false })).toEqual([]);
  });

  it("holds the BAST of a TELKOM project until BARD and BAUT are both recorded", () => {
    expect(bastProblems({ ...base, telkomScheme: true })).toEqual(["bard", "baut"]);
    expect(bastProblems({ ...base, telkomScheme: true, bard: { nomor: "BARD/1", tanggal: "2027-07-01" } })).toEqual(["baut"]);
    expect(bastProblems({ ...base, telkomScheme: true, bard: { nomor: "BARD/1", tanggal: "2027-07-01" }, baut: { nomor: "BAUT/1", tanggal: "2027-07-02" } })).toEqual([]);
  });

  it("telkomProblems: needs a number and a valid date for each document", () => {
    expect(telkomProblems({ nomor: "BARD/1", tanggal: "2027-07-01" })).toEqual([]);
    expect(telkomProblems({ nomor: " ", tanggal: "2027-07-01" })).toEqual(["nomor"]);
    expect(telkomProblems({ nomor: "BARD/1", tanggal: "2027-07-32" })).toEqual(["tanggal"]);
  });

  it("is recorded by Assurance (BCD) once RFS is approved, never by PDMS", () => {
    expect(canProject(actor({ orgUnit: "BCD" }), "telkom.record", project, org)).toBe(true);
    expect(canProject(actor({ userId: "pa" }), "telkom.record", project, org)).toBe(false);
    expect(canProject(actor({ orgUnit: "BCD", entities: ["MMT"] }), "telkom.record", project, org)).toBe(false);
  });
});
