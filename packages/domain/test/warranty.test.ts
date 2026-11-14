import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { DEFECT_STATUSES, canWarranty, closureProblems, defectProblems, isOpenDefect, serviceStage, transitionDays, warrantyProblems, type DefectState } from "../src/warranty";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "ISO", parent: "PDMS" },
  { code: "ISO-PH", parent: "ISO" },
  { code: "MSO", parent: "PDMS" },
  { code: "MSO-EOS", parent: "MSO" },
  { code: "FRM", parent: "DIR" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "PMO", entities: ["*"], ...over });
const project = { entity: "ESTRADA", team: { pm: "pm", deliveryControl: "dc", projectAdmin: "pa" } };
const defect = (over: Partial<DefectState> = {}): DefectState => ({ status: "Diajukan", reportedBy: "ph", confirmedIso: null, confirmedPmo: null, ...over });

describe("transitionDays: masa peralihan (Serah Terima D row 2)", () => {
  it("counts the days between BAST and MSO's acceptance, which stay PMO's responsibility", () => {
    expect(transitionDays("2027-07-05", "2027-07-19")).toBe(14);
    expect(transitionDays("2027-07-05", "2027-07-05")).toBe(0);
  });

  it("is unknown until both dates exist", () => {
    expect(transitionDays("2027-07-05", null)).toBeNull();
    expect(transitionDays(null, null)).toBeNull();
  });
});

describe("serviceStage: Layanan lalu Garansi (Kamus Field A rows 7-8)", () => {
  it("enters Garansi once ISO has accepted and the warranty end date is set", () => {
    expect(serviceStage({ status: "Layanan", handoverStatus: "Diterima_ISO", warrantyEndsOn: "2028-07-05" })).toBe("Garansi");
  });

  it("stays in Layanan while either is missing", () => {
    expect(serviceStage({ status: "Layanan", handoverStatus: "Diterima_MSO", warrantyEndsOn: "2028-07-05" })).toBe("Layanan");
    expect(serviceStage({ status: "Layanan", handoverStatus: "Diterima_ISO", warrantyEndsOn: null })).toBe("Layanan");
  });

  it("never moves a project that is not in Layanan", () => {
    expect(serviceStage({ status: "Penagihan", handoverStatus: "Diterima_ISO", warrantyEndsOn: "2028-07-05" })).toBe("Penagihan");
    expect(serviceStage({ status: "Closing", handoverStatus: "Selesai", warrantyEndsOn: "2028-07-05" })).toBe("Closing");
  });
});

describe("warrantyProblems: tgl_akhir_garansi (Kamus Field A row 8)", () => {
  it("accepts an end date on or after the BAST", () => {
    expect(warrantyProblems({ status: "Layanan", bastOn: "2027-07-05" }, "2028-07-05")).toEqual([]);
  });

  it("refuses an invalid date, a date before the BAST, a project without BAST and a closed project", () => {
    expect(warrantyProblems({ status: "Layanan", bastOn: "2027-07-05" }, "2028-02-30")).toEqual(["date"]);
    expect(warrantyProblems({ status: "Layanan", bastOn: "2027-07-05" }, "2027-07-04")).toEqual(["before_bast"]);
    expect(warrantyProblems({ status: "Implementasi", bastOn: null }, "2028-07-05")).toEqual(["no_bast"]);
    expect(warrantyProblems({ status: "Closing", bastOn: "2027-07-05" }, "2028-07-05")).toEqual(["closed"]);
  });
});

describe("defectProblems: cacat bawaan proyek pada masa garansi (Serah Terima D row 1)", () => {
  it("has five statuses; three of them are still open", () => {
    expect(DEFECT_STATUSES).toEqual(["Diajukan", "Cacat_Bawaan", "Operasional", "Diperbaiki", "Ditutup"]);
    expect(DEFECT_STATUSES.filter(isOpenDefect)).toEqual(["Diajukan", "Cacat_Bawaan", "Diperbaiki"]);
  });

  it("report: needs a description, and a project MSO has accepted", () => {
    expect(defectProblems("report", null, "ph", { text: "Router POLDA-JATIM-01 mati sejak dipasang", msoAcceptedOn: "2027-07-19" })).toEqual({ problems: [], next: "Diajukan" });
    expect(defectProblems("report", null, "ph", { text: " ", msoAcceptedOn: "2027-07-19" }).problems).toEqual(["text"]);
    expect(defectProblems("report", null, "ph", { text: "x", msoAcceptedOn: null }).problems).toEqual(["not_handed_over"]);
  });

  it("confirm: it becomes an inherited defect only when Head ISO and Head PMO both confirm", () => {
    expect(defectProblems("confirm_iso", defect(), "iso")).toEqual({ problems: [], next: "Diajukan" });
    expect(defectProblems("confirm_pmo", defect({ confirmedIso: "iso" }), "pmo")).toEqual({ problems: [], next: "Cacat_Bawaan" });
    expect(defectProblems("confirm_iso", defect({ confirmedPmo: "pmo" }), "iso").next).toBe("Cacat_Bawaan");
  });

  it("confirm: one person cannot decide it alone: WARRANTY_SELF_CLASSIFICATION", () => {
    expect(defectProblems("confirm_pmo", defect({ confirmedIso: "x" }), "x").problems).toEqual(["WARRANTY_SELF_CLASSIFICATION"]);
    expect(defectProblems("confirm_iso", defect({ reportedBy: "iso" }), "iso").problems).toEqual(["WARRANTY_SELF_CLASSIFICATION"]);
  });

  it("reject: either head sets it aside as operational, with a reason", () => {
    expect(defectProblems("reject", defect(), "iso", { text: "Kerusakan akibat petir setelah serah terima" })).toEqual({ problems: [], next: "Operasional" });
    expect(defectProblems("reject", defect(), "iso", { text: "" }).problems).toEqual(["text"]);
    // "cacat bawaan proyek atau bukan": the reporter does not settle it alone in either direction.
    expect(defectProblems("reject", defect({ reportedBy: "iso" }), "iso", { text: "Bukan cacat" }).problems).toEqual(["WARRANTY_SELF_CLASSIFICATION"]);
    expect(defectProblems("reject", defect({ status: "Cacat_Bawaan" }), "iso", { text: "x" }).problems).toEqual(["wrong_status"]);
  });

  it("fix then close: Delivery Control records the corrective work, the Head PMO closes it", () => {
    expect(defectProblems("fix", defect({ status: "Cacat_Bawaan" }), "dc", { text: "Router diganti lewat RMA" })).toEqual({ problems: [], next: "Diperbaiki" });
    expect(defectProblems("fix", defect({ status: "Diajukan" }), "dc", { text: "x" }).problems).toEqual(["wrong_status"]);
    expect(defectProblems("fix", defect({ status: "Cacat_Bawaan" }), "dc", { text: " " }).problems).toEqual(["text"]);
    expect(defectProblems("close", defect({ status: "Diperbaiki" }), "head")).toEqual({ problems: [], next: "Ditutup" });
    expect(defectProblems("close", defect({ status: "Cacat_Bawaan" }), "head").problems).toEqual(["wrong_status"]);
  });
});

describe("closureProblems: CLOSURE_REQUIRES_RECEIVER (Kewenangan B, Serah Terima E gate 9)", () => {
  const ready = { status: "Garansi" as const, msoAcceptedOn: "2027-07-19", handoverStatus: "Diterima_ISO" as const, warrantyEndsOn: "2028-07-05", defects: [{ status: "Ditutup" as const }, { status: "Operasional" as const }] };

  it("allows closing on the day the warranty ends, with no inherited defect open", () => {
    expect(closureProblems(ready, "2028-07-05")).toEqual([]);
  });

  it("refuses while the warranty is still running", () => {
    expect(closureProblems(ready, "2028-07-04")).toEqual(["warranty_running"]);
  });

  it("refuses with an inherited defect still open: the warranty runs on until it is closed", () => {
    expect(closureProblems({ ...ready, defects: [{ status: "Diperbaiki" }] }, "2028-08-01")).toEqual(["defects_open"]);
  });

  it("refuses before MSO and ISO have accepted, and without a warranty end date", () => {
    expect(closureProblems({ ...ready, msoAcceptedOn: null, handoverStatus: "Diajukan", warrantyEndsOn: null }, "2028-08-01")).toEqual(["not_accepted", "warranty_unset"]);
    expect(closureProblems({ ...ready, handoverStatus: "Diterima_MSO" }, "2028-08-01")).toEqual(["iso"]);
  });

  it("refuses a project that is already closed", () => {
    expect(closureProblems({ ...ready, status: "Closing" }, "2028-08-01")).toEqual(["closed"]);
  });
});

describe("canWarranty: matriks peran (Kewenangan A rows 32, 34)", () => {
  it("BCD sets the warranty end date (Kamus domain SALES_ASSURANCE)", () => {
    expect(canWarranty(actor({ orgUnit: "BCD" }), "warranty.set", project, org)).toBe(true);
    expect(canWarranty(actor({ userId: "pm" }), "warranty.set", project, org)).toBe(false);
  });

  it("ISO and MSO report a suspected inherited defect", () => {
    expect(canWarranty(actor({ orgUnit: "ISO-PH" }), "defect.report", project, org)).toBe(true);
    expect(canWarranty(actor({ orgUnit: "MSO-EOS" }), "defect.report", project, org)).toBe(true);
    expect(canWarranty(actor({ orgUnit: "PMO" }), "defect.report", project, org)).toBe(false);
  });

  it("Head ISO and Head PMO each confirm their side, and either may reject", () => {
    const iso = actor({ role: "default_owner", orgUnit: "ISO" });
    const pmo = actor({ role: "default_owner", orgUnit: "PMO" });
    expect(canWarranty(iso, "defect.confirm_iso", project, org)).toBe(true);
    expect(canWarranty(pmo, "defect.confirm_iso", project, org)).toBe(false);
    expect(canWarranty(pmo, "defect.confirm_pmo", project, org)).toBe(true);
    expect(canWarranty(iso, "defect.confirm_pmo", project, org)).toBe(false);
    expect(canWarranty(iso, "defect.reject", project, org)).toBe(true);
    expect(canWarranty(pmo, "defect.reject", project, org)).toBe(true);
    expect(canWarranty(actor({ orgUnit: "ISO-PH" }), "defect.reject", project, org)).toBe(false);
  });

  it("row 32: Delivery Control does the corrective work; the Head PMO closes it", () => {
    expect(canWarranty(actor({ userId: "dc" }), "defect.fix", project, org)).toBe(true);
    expect(canWarranty(actor({ userId: "pm" }), "defect.fix", project, org)).toBe(false);
    expect(canWarranty(actor({ role: "default_owner", orgUnit: "PMO" }), "defect.close", project, org)).toBe(true);
    expect(canWarranty(actor({ userId: "dc" }), "defect.close", project, org)).toBe(false);
  });

  it("row 34: the Head PMO declares the project closed", () => {
    expect(canWarranty(actor({ role: "division_owner", orgUnit: "PDMS" }), "close", project, org)).toBe(true);
    expect(canWarranty(actor({ role: "default_owner", orgUnit: "ISO" }), "close", project, org)).toBe(false);
  });

  it("keeps every action inside the user's entities", () => {
    expect(canWarranty(actor({ role: "default_owner", orgUnit: "PMO", entities: ["MMT"] }), "close", project, org)).toBe(false);
  });
});
