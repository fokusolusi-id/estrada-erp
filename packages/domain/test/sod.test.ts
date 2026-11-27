import { describe, expect, it } from "vitest";
import { SOD_FORBIDDEN, SOD_FUNCTIONS, sodConflict, sodFunctions, type SodFunction } from "../src/sod";

// Every cell marked X (WAJIB DIPISAH) in sheet 05_SoD_Matrix (BR-NFR-003).
const X: [SodFunction, SodFunction][] = [
  ["Head BusDev", "Sales"],
  ["PM", "SCM"],
  ["PM", "Finance-CashMgmt"],
  ["PM", "Finance-AR/Tax"],
  ["SCM", "Finance-CashMgmt"],
  ["SCM", "Finance-AR/Tax"],
  ["Finance-Pricing", "Finance-CashMgmt"],
  ["Finance-Pricing", "Finance-AR/Tax"],
  ["Finance-Pricing", "Accounting"],
  ["Finance-CashMgmt", "Finance-AR/Tax"],
  ["Finance-CashMgmt", "Accounting"],
  ["Finance-AR/Tax", "Accounting"],
  ["Audit/Controller", "Data Steward MD"],
];

const step = (userId: string, ...functions: SodFunction[]) => ({ userId, functions });

describe("05_SoD_Matrix X pairs", () => {
  it("encodes exactly those pairs", () => {
    expect([...SOD_FORBIDDEN].map((p) => [...p].sort().join(" × ")).sort()).toEqual(X.map((p) => [...p].sort().join(" × ")).sort());
  });

  it.each(X)("one person may not do a %s step and then a %s step on a record, in either order", (a, b) => {
    expect(sodConflict(step("u", b), [step("u", a)])).toEqual({ did: a, now: b });
    expect(sodConflict(step("u", a), [step("u", b)])).toEqual({ did: b, now: a });
    expect(sodConflict(step("u", b), [step("other", a)])).toBeNull();
  });

  it("lets every other pair through", () => {
    const forbidden = new Set(X.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
    for (const a of SOD_FUNCTIONS) for (const b of SOD_FUNCTIONS) if (!forbidden.has(`${a}|${b}`)) expect(sodConflict(step("u", b), [step("u", a)]), `${a} → ${b}`).toBeNull();
  });

  it("does not set a seat that holds two functions against itself", () => {
    expect(sodConflict(step("u", "Finance-AR/Tax", "Accounting"), [step("u", "Finance-AR/Tax", "Accounting")])).toBeNull();
  });
});

describe("sodFunctions: the app's seats as the matrix names them", () => {
  it("reads the role first", () => {
    expect(sodFunctions("director", "DIR")).toEqual(["BOD", "Direktur PT"]);
    expect(sodFunctions("finance", "FRM")).toEqual(["Finance-Pricing"]);
    expect(sodFunctions("bfp", "FRM-FIN-BFP")).toEqual(["Finance-Pricing"]);
    expect(sodFunctions("cash_manager", "FRM-FIN-TCM")).toEqual(["Finance-CashMgmt"]);
    expect(sodFunctions("auditor", "DIR")).toEqual(["Audit/Controller"]);
    expect(sodFunctions("admin", "DIR")).toEqual(["IT Admin"]);
  });
  it("then the unit", () => {
    expect(sodFunctions("division_owner", "BCD")).toEqual(["Head BusDev"]);
    expect(sodFunctions("requestor", "BCD-TEL-AM")).toEqual(["Sales"]);
    expect(sodFunctions("requestor", "PMO-PM")).toEqual(["PM"]);
    expect(sodFunctions("default_owner", "SCM")).toEqual(["SCM"]);
    expect(sodFunctions("requestor", "MSO-EOS")).toEqual(["OPS"]);
    expect(sodFunctions("requestor", "FRM-FIN-ATM")).toEqual(["Finance-AR/Tax", "Accounting"]);
    expect(sodFunctions("division_owner", "PDMS")).toEqual([]);
    expect(sodFunctions("requestor", null)).toEqual([]);
  });
});
