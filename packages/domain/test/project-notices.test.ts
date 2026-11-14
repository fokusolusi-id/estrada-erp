import { describe, expect, it } from "vitest";
import { OrgTree } from "../src/org";
import type { PaymentSeat } from "../src/payment";
import { PROJECT_NOTICES, projectRecipients, type ProjectEvent } from "../src/project-notices";

const org = new OrgTree([
  { code: "DIR", parent: null },
  { code: "BCD", parent: "DIR" },
  { code: "PDMS", parent: "DIR" },
  { code: "PMO", parent: "PDMS" },
  { code: "ISO", parent: "PDMS" },
  { code: "ISO-PH", parent: "ISO" },
  { code: "MSO", parent: "PDMS" },
  { code: "MSO-EOS", parent: "MSO" },
]);
const seat = (orgUnit: string, role: PaymentSeat["role"], occupant: string | null, entities: string[] = ["*"]): PaymentSeat => ({ orgUnit, role, occupant, entities });
const seats = [
  seat("PMO", "default_owner", "head-pmo"),
  seat("PDMS", "division_owner", "head-pdms"),
  seat("PMO-PM", "requestor", "pm"),
  seat("MSO", "default_owner", "head-mso"),
  seat("MSO-EOS", "requestor", "eos"),
  seat("ISO", "default_owner", "head-iso"),
  seat("ISO-PH", "requestor", "ph"),
  seat("BCD", "requestor", "bcd1"),
  seat("BCD", "requestor", "bcd2", ["MMT"]),
  seat("BCD", "default_owner", null),
];
const project = { entity: "ESTRADA", team: { pm: "pm", deliveryControl: "dc", projectAdmin: "pa" } };

describe("PROJECT_NOTICES: one email per handoff, never one per site (Serah Terima, Modul Implementasi F1)", () => {
  const to = (e: ProjectEvent) => PROJECT_NOTICES[e].map((n) => `${n.template}>${n.to}`);

  it("tells the team when it is assigned", () => {
    expect(to("team_assigned")).toEqual(["project_team>pm", "project_team>delivery_control", "project_team>project_admin"]);
  });

  it("sends RFS and BAST to the Head PMO for approval", () => {
    expect(to("rfs_declared")).toEqual(["project_rfs_approval>head_pmo"]);
    expect(to("bast_prepared")).toEqual(["project_bast_approval>head_pmo"]);
  });

  it("tells BCD and the Project Manager once the BAST is approved: billing and handover start", () => {
    expect(to("bast_approved")).toEqual(["project_bast_approved>assurance", "project_bast_approved>pm"]);
  });

  it("walks the handover: MSO, back to the PM on return, then ISO and EOS", () => {
    expect(to("handover_submitted")).toEqual(["project_handover_submitted>head_mso"]);
    expect(to("handover_returned")).toEqual(["project_handover_returned>pm"]);
    expect(to("handover_accepted")).toEqual(["project_handover_accepted>head_iso", "project_handover_accepted>eos"]);
  });

  it("asks both heads to classify a reported fault, and tells Delivery Control when it is an inherited defect", () => {
    expect(to("defect_reported")).toEqual(["project_defect_reported>head_iso", "project_defect_reported>head_pmo"]);
    expect(to("defect_inherited")).toEqual(["project_defect_inherited>delivery_control"]);
  });

  it("has no event for the per-site BAI steps", () => {
    expect(Object.keys(PROJECT_NOTICES).some((k) => k.startsWith("bai"))).toBe(false);
  });
});

describe("projectRecipients", () => {
  it("resolves the team from the project", () => {
    expect(projectRecipients("pm", project, seats, org)).toEqual(["pm"]);
    expect(projectRecipients("delivery_control", project, seats, org)).toEqual(["dc"]);
    expect(projectRecipients("project_admin", project, seats, org)).toEqual(["pa"]);
    expect(projectRecipients("pm", { ...project, team: { ...project.team, pm: null } }, seats, org)).toEqual([]);
  });

  it("finds the Head PMO, including the Head PDMS above it", () => {
    expect(projectRecipients("head_pmo", project, seats, org)).toEqual(["head-pdms", "head-pmo"]);
  });

  it("finds Head MSO and Head ISO only at their own unit, not above it", () => {
    expect(projectRecipients("head_mso", project, seats, org)).toEqual(["head-mso"]);
    expect(projectRecipients("head_iso", project, seats, org)).toEqual(["head-iso"]);
  });

  it("finds Staff Operational EOS in MSO-EOS", () => {
    expect(projectRecipients("eos", project, seats, org)).toEqual(["eos"]);
  });

  it("finds Assurance among BCD's people within the project's entity, skipping empty seats", () => {
    expect(projectRecipients("assurance", project, seats, org)).toEqual(["bcd1"]);
    expect(projectRecipients("assurance", { ...project, entity: "MMT" }, seats, org)).toEqual(["bcd1", "bcd2"]);
  });

  it("does not email the person who did the thing", () => {
    expect(projectRecipients("head_pmo", project, seats, org, "head-pmo")).toEqual(["head-pdms"]);
  });

  it("keeps a seat holder out of an entity they do not cover", () => {
    expect(projectRecipients("head_mso", project, [seat("MSO", "default_owner", "m", ["MMT"])], org)).toEqual([]);
  });
});
