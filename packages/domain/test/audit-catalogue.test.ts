import { describe, expect, it } from "vitest";
import { AUDIT_EVENTS, AUDIT_MODULES, auditEvent, auditMatcher, auditResult } from "../src/audit-catalogue";

// Every action the app writes to audit_log.
const APP_ACTIONS = [
  "auth.login", "auth.login_failed", "auth.logout", "admin.act_as", "position.switch", "user.invite", "user.update",
  "position.create", "position.update", "position.assign_acting", "position.clear_acting",
  "line.create", "line.update", "line.delete", "line.comment", "line.shared", "line.actual", "variance.note", "actual.adjust", "invoice.create", "invoice.update", "invoice.return", "invoice.cancel", "invoice.validate", "invoice.approve", "invoice.issue", "receipt.record", "receipt.reverse",
  "line.submit", "line.consolidate", "line.approve", "line.finalize", "line.lock", "line.return", "line.send_back", "line.clarify",
  "cycle.deadline", "cycle.open", "cycle.revise", "version.headcount",
  "pipeline.create", "pipeline.update", "pipeline.delete", "pipeline.recovery_plan",
  "project.open", "project.contract_p8", "project.contract_record", "project.contract_pic", "project.assign", "project.baseline", "project.contract_sites", "project.status", "project.drop", "project.close", "project.rfs_declare", "project.rfs_approve",
  "project.bast_prepare", "project.bast_approve", "project.kickoff_gate", "project.telkom_scheme", "project.warranty", "project_planning.record",
  "project_site.create", "project_site.update", "project_site.delete", "project_site.bai_return", "project_site.bai_verify",
  "handover.accept_iso", "handover.checklist", "handover.package", "handover.submit", "handover.accept_mso", "handover.return",
  "defect.close", "defect.confirm_iso", "project_defect.report", "project_defect.fix",
  "payment.create", "payment.update", "payment.document_add", "payment.document_remove", "payment.submit", "payment.approve", "payment.verify", "payment.return", "payment.schedule", "payment.pay",
  "period.start_closing", "period.cancel_closing", "period.close", "period.reopen",
  "master.customer.create", "master.customer.update", "master.employee.create", "master.partner.update", "master.product.create", "master.costcenter.update",
  "master.request.submit", "master.request.approve", "master.request.reject", "master.request.cancel", "master.request.fail",
  "coa.create", "coa.update", "coa.confirm", "coa.remap", "coa.only_file", "entity.create", "entity.update", "entity.import", "unit.create", "unit.update", "unit.import_cost_center",
  "bank_account.create", "bank_account.update", "cash.assumptions", "cash.carry_forward", "cash.entry", "cash.entry_reverse", "sph.create", "sph.review", "sph.approve", "sph.return", "sph.resubmit", "procurement.pr_create", "procurement.pr_decide", "procurement.po_create", "procurement.po_approve", "procurement.receive", "telkom.start", "telkom.stage", "telkom.reopen", "telkom.obstacle", "telkom.obstacle_update", "telkom.assurance", "cash.scenarios", "tax.document", "closing.balance", "compliance.update", "tax.pph21", "loan.facility", "loan.drawing_request", "loan.drawing_issue", "loan.drawing_reject", "loan.release_confirm", "loan.release", "loan.payment", "loan.payment_reverse", "loan.create", "loan.update", "loan.delete",
  "import.cash", "import.pipeline", "import.workbook",
];

describe("audit event catalogue (sheet 04_Audit_Log_Spec, SCR-AUD-01)", () => {
  it("gives every app action a code, module, severity and retention", () => {
    const missing = APP_ACTIONS.filter((a) => auditEvent(a).code === "SYS.OTHER");
    expect(missing).toEqual([]);
  });

  it("carries the sheet's severity and retention", () => {
    expect(auditEvent("auth.login")).toMatchObject({ code: "AUTH.LOGIN", severity: "Info", retentionYears: 1, module: "Security", inSheet: true });
    expect(auditEvent("line.approve")).toMatchObject({ code: "RKA.APPROVE", severity: "High", retentionYears: 10 });
    expect(auditEvent("period.close")).toMatchObject({ code: "FIN.CLOSE", severity: "Critical" });
    expect(auditEvent("position.update")).toMatchObject({ code: "SEC.PERMCHANGE", severity: "Critical" });
    expect(auditEvent("master.request.approve")).toMatchObject({ code: "MD.APPROVE", severity: "Critical" });
    expect(auditEvent("payment.pay").inSheet).toBe(false);
    expect(auditEvent("something.new")).toMatchObject({ code: "SYS.OTHER" });
  });

  it("marks failures", () => {
    expect([auditResult("auth.login_failed"), auditResult("master.request.fail"), auditResult("auth.login")]).toEqual(["fail", "fail", "success"]);
  });

  it("finds the actions of a code or a module, so the viewer can filter in the database", () => {
    const matches = (filter: { code?: string; module?: string }) => {
      const m = auditMatcher(filter);
      return APP_ACTIONS.filter((a) => m.exact.includes(a) || m.prefixes.some((p) => a.startsWith(p)));
    };
    for (const e of AUDIT_EVENTS) expect(matches({ code: e.code }), e.code).toEqual(APP_ACTIONS.filter((a) => auditEvent(a).code === e.code));
    for (const module of AUDIT_MODULES) expect(matches({ module }), module).toEqual(APP_ACTIONS.filter((a) => auditEvent(a).module === module));
  });
});
