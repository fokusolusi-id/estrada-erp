import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { Actor } from "../src/policy";
import { ARTEFACTS, EOS_CHECKLIST, HANDOVER_STATUSES, MSO_CRITERIA, canHandover, handoverProblems, missingArtefacts, type HandoverState } from "../src/handover";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "ISO", parent: "PDMS" },
  { code: "ISO-SD", parent: "ISO" },
  { code: "MSO", parent: "PDMS" },
  { code: "MSO-EOS", parent: "MSO" },
]);
const actor = (over: Partial<Actor>): Actor => ({ userId: "u", role: "requestor", orgUnit: "PMO", entities: ["*"], ...over });
const project = { entity: "ESTRADA", team: { pm: "pm", deliveryControl: "dc", projectAdmin: "pa" } };

const all = (keys: readonly { key: string }[], value = true) => Object.fromEntries(keys.map((k) => [k.key, value]));
const state = (over: Partial<HandoverState> = {}): HandoverState => ({
  status: "Disusun",
  hasApplication: false,
  artefacts: ARTEFACTS.filter((a) => a.need === "wajib").map((a) => a.no),
  bastOn: "2027-07-05",
  submittedBy: null,
  criteria: all(MSO_CRITERIA, false),
  checklist: all(EOS_CHECKLIST, false),
  ...over,
});

describe("catalogue: Serah Terima sections A, B, C and Kamus Field D", () => {
  it("has the six package statuses", () => {
    expect(HANDOVER_STATUSES).toEqual(["Disusun", "Diajukan", "Dikembalikan", "Diterima_MSO", "Diterima_ISO", "Selesai"]);
  });

  it("lists 15 artefacts: 13 mandatory, one only with an application, one recommended", () => {
    expect(ARTEFACTS.map((a) => a.no)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(ARTEFACTS.filter((a) => a.need === "wajib")).toHaveLength(13);
    expect(ARTEFACTS.find((a) => a.need === "aplikasi")?.no).toBe(8);
    expect(ARTEFACTS.find((a) => a.need === "dianjurkan")?.no).toBe(14);
  });

  it("has Head MSO's five criteria and Staff Operational EOS's four checklist items", () => {
    expect(MSO_CRITERIA.map((c) => c.key)).toEqual(["lingkupKontrak", "ambangSla", "sparePart", "topologiKonfigurasi", "administrasi"]);
    expect(EOS_CHECKLIST.map((c) => c.key)).toEqual(["perangkatCadangan", "lisensi", "topologiJaringan", "aksesRemote"]);
  });
});

describe("missingArtefacts: artefak_lengkap (Kamus Field D row 5)", () => {
  const mandatory = ARTEFACTS.filter((a) => a.need === "wajib").map((a) => a.no);

  it("is complete with the 13 mandatory artefacts when the project has no application", () => {
    expect(missingArtefacts(mandatory, false)).toEqual([]);
  });

  it("also asks for repository and CI/CD access (8) when there is an application", () => {
    expect(missingArtefacts(mandatory, true)).toEqual([8]);
  });

  it("never asks for the recommended user manual (14)", () => {
    expect(missingArtefacts(mandatory.filter((n) => n !== 6), false)).toEqual([6]);
  });
});

describe("handoverProblems: urutan gerbang (Serah Terima E gates 5-8)", () => {
  it("gate 5: the package is submitted once the BAST is approved and the mandatory artefacts are in", () => {
    expect(handoverProblems("submit", state(), "pm")).toEqual({ problems: [], next: "Diajukan" });
    expect(handoverProblems("submit", state({ status: "Dikembalikan" }), "pm").problems).toEqual([]);
  });

  it("gate 5: refuses before BAST or with an artefact missing", () => {
    expect(handoverProblems("submit", state({ bastOn: null }), "pm").problems).toEqual(["bast"]);
    expect(handoverProblems("submit", state({ artefacts: [1, 2, 3] }), "pm").problems).toEqual(["artefacts"]);
    expect(handoverProblems("submit", state({ status: "Diajukan" }), "pm").problems).toEqual(["wrong_status"]);
  });

  it("gate 6: Head MSO accepts only with all five criteria met", () => {
    const submitted = state({ status: "Diajukan", submittedBy: "pm" });
    expect(handoverProblems("accept_mso", { ...submitted, criteria: all(MSO_CRITERIA) }, "mso")).toEqual({ problems: [], next: "Diterima_MSO" });
    expect(handoverProblems("accept_mso", { ...submitted, criteria: { ...all(MSO_CRITERIA), sparePart: false } }, "mso").problems).toEqual(["criteria"]);
  });

  it("gate 6: the submitter cannot accept: HANDOVER_SELF_ACCEPTANCE", () => {
    expect(handoverProblems("accept_mso", state({ status: "Diajukan", submittedBy: "pm", criteria: all(MSO_CRITERIA) }), "pm").problems).toEqual(["HANDOVER_SELF_ACCEPTANCE"]);
  });

  it("gate 6: a return needs a note and sends the package back to PMO", () => {
    const submitted = state({ status: "Diajukan", submittedBy: "pm" });
    expect(handoverProblems("return", submitted, "mso", "Daftar spare belum ada nomor seri")).toEqual({ problems: [], next: "Dikembalikan" });
    expect(handoverProblems("return", submitted, "mso", " ").problems).toEqual(["note"]);
    expect(handoverProblems("return", state({ status: "Diterima_MSO" }), "mso", "x").problems).toEqual(["wrong_status"]);
  });

  it("gate 7: the checklist is filled once the package is submitted, not while PMO still drafts it", () => {
    expect(handoverProblems("checklist", state({ status: "Diajukan" }), "eos").problems).toEqual([]);
    expect(handoverProblems("checklist", state({ status: "Diterima_MSO" }), "eos").problems).toEqual([]);
    expect(handoverProblems("checklist", state(), "eos").problems).toEqual(["wrong_status"]);
  });

  it("gate 8: Head ISO accepts after MSO, with the four checklist items met", () => {
    const accepted = state({ status: "Diterima_MSO" });
    expect(handoverProblems("accept_iso", { ...accepted, checklist: all(EOS_CHECKLIST) }, "iso")).toEqual({ problems: [], next: "Diterima_ISO" });
    expect(handoverProblems("accept_iso", { ...accepted, checklist: { ...all(EOS_CHECKLIST), aksesRemote: false } }, "iso").problems).toEqual(["checklist"]);
    expect(handoverProblems("accept_iso", state({ status: "Diajukan", checklist: all(EOS_CHECKLIST) }), "iso").problems).toEqual(["wrong_status"]);
  });

  it("artefacts are edited only while PMO holds the package", () => {
    expect(handoverProblems("artefact", state(), "pm").problems).toEqual([]);
    expect(handoverProblems("artefact", state({ status: "Dikembalikan" }), "pm").problems).toEqual([]);
    expect(handoverProblems("artefact", state({ status: "Diajukan" }), "pm").problems).toEqual(["wrong_status"]);
  });
});

describe("canHandover: matriks peran (Kewenangan A rows 25-28)", () => {
  it("row 25: the project team fills the artefacts; the Project Manager submits", () => {
    for (const userId of ["pm", "dc", "pa"]) expect(canHandover(actor({ userId }), "artefact", project, org)).toBe(true);
    expect(canHandover(actor({ userId: "other" }), "artefact", project, org)).toBe(false);
    expect(canHandover(actor({ userId: "pm" }), "submit", project, org)).toBe(true);
    expect(canHandover(actor({ userId: "pa" }), "submit", project, org)).toBe(false);
  });

  it("row 26: Head MSO accepts or returns", () => {
    const head = actor({ role: "default_owner", orgUnit: "MSO", userId: "mso" });
    expect(canHandover(head, "accept_mso", project, org)).toBe(true);
    expect(canHandover(head, "return", project, org)).toBe(true);
    expect(canHandover(actor({ role: "requestor", orgUnit: "MSO" }), "accept_mso", project, org)).toBe(false);
    expect(canHandover(actor({ role: "default_owner", orgUnit: "ISO" }), "accept_mso", project, org)).toBe(false);
    expect(canHandover(actor({ role: "default_owner", orgUnit: "PMO" }), "accept_mso", project, org)).toBe(false);
  });

  it("row 27: Staff Operational EOS fills the checklist", () => {
    expect(canHandover(actor({ orgUnit: "MSO-EOS" }), "checklist", project, org)).toBe(true);
    expect(canHandover(actor({ orgUnit: "ISO-SD" }), "checklist", project, org)).toBe(false);
  });

  it("row 28: Head ISO accepts the technical handover", () => {
    expect(canHandover(actor({ role: "default_owner", orgUnit: "ISO" }), "accept_iso", project, org)).toBe(true);
    expect(canHandover(actor({ role: "default_owner", orgUnit: "MSO" }), "accept_iso", project, org)).toBe(false);
    expect(canHandover(actor({ role: "requestor", orgUnit: "ISO-SD" }), "accept_iso", project, org)).toBe(false);
  });

  it("keeps every action inside the user's entities", () => {
    expect(canHandover(actor({ role: "default_owner", orgUnit: "MSO", entities: ["MMT"] }), "accept_mso", project, org)).toBe(false);
  });
});
