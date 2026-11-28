import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { money } from "@estrada/domain";
import { BudgetGrid, type GridLine } from "./budget-grid";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));

const lines: GridLine[] = [
  { id: "a", category: "OPEX", item: "Langganan fiber kantor", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("19821320"), state: "draft" },
  { id: "c", category: "OPEX", coaCode: "6291", coaName: "Beban penyusutan gedung", entity: "ESTRADA", requestorUnit: "FRM", ownerUnit: "FRM", months: flat("11145836"), state: "draft", priorRka: null, priorActual: money("127920227"), flags: ["Cek potensi double counting dengan RKA HCM"] },
  { id: "b", category: "OPEX", coaCode: "6243", coaName: "Beban telekomunikasi", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("1648000"), state: "consolidation" },
];

describe("BudgetGrid", () => {
  afterEach(cleanup);

  it("opens a line from its title, shown on up to two lines", () => {
    render(<BudgetGrid priorYear={2026} lines={lines.slice(0, 1)} unit="rp" />);
    const title = screen.getByRole("link", { name: "6241 · Langganan fiber kantor" });
    expect(title.getAttribute("href")).toBe("/rka/line/a");
    expect(title.className).toContain("line-clamp-2");
  });

  it("repeats the total and stage under the title on a phone", () => {
    render(<BudgetGrid priorYear={2026} lines={lines.slice(0, 1)} unit="rp" />);
    const summary = screen.getByTestId("phone-a");
    expect(summary.className).toContain("sm:hidden");
    expect(summary.textContent).toContain("237.855.840");
    expect(summary.textContent).toContain("Draft");
  });

  it("does not link a line to itself where the discussion is already on the page", () => {
    render(<BudgetGrid priorYear={2026} lines={lines.slice(0, 1)} discussion={false} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("gives the discussion link a 24px target", () => {
    render(<BudgetGrid priorYear={2026} lines={lines.slice(0, 1)} />);
    expect(screen.getByRole("link", { name: /^Diskusi/ }).className).toContain("min-h-6");
  });

  it("names the unit that owns each line, and who asked for it when that differs", () => {
    render(<BudgetGrid priorYear={2026} lines={[{ ...lines[0]!, ownerUnit: "FRM", requestorUnit: "SCM" }, lines[1]!]} />);
    expect(screen.getByTestId("unit-a").textContent).toBe("FRM · diminta SCM");
    expect(screen.getByTestId("unit-c").textContent).toBe("FRM");
  });

  it("puts the total, last year and the change ahead of the months", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads.slice(3, 7)).toEqual(["Total RKA", "Actual 2026", "Perubahan", "Jan"]);
  });

  it("computes each line total from the 12 months", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("total-a").textContent).toBe("237.855.840");
  });

  it("shows a grand total across lines", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("grand-total-Cost").textContent).toBe("391.381.872");
  });

  it("adds the Total row over every line when only one page is shown", () => {
    render(<BudgetGrid priorYear={2026} lines={lines.slice(0, 1)} totalOf={lines} unit="rp" />);
    expect(screen.queryByTestId("total-b")).toBeNull();
    expect(screen.getByTestId("grand-total-Cost").textContent).toBe("391.381.872");
  });

  it("drops the Entitas column once the header narrows to one entity", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" hide={{ entity: true }} />);
    expect(screen.queryByRole("columnheader", { name: "Entitas" })).toBeNull();
    expect(screen.getByTestId("grand-total-Cost").textContent).toBe("391.381.872");
  });

  it("labels approval state in Bahasa Indonesia", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} />);
    expect(screen.getAllByText("Konsolidasi").length).toBeGreaterThan(0);
  });

  it("shows Actual 2026 and the change beside each line", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("actual-c").textContent).toBe("127.920.227");
    expect(screen.getByTestId("actual-a").textContent).toBe("—");
  });

  it("flags lines the workbook marked for review", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTitle("Cek potensi double counting dengan RKA HCM").textContent).toBe("Perlu review");
  });

  it("links each line to its discussion, with the comment count", () => {
    render(<BudgetGrid priorYear={2026} lines={[{ ...lines[0]!, commentCount: 2 }, lines[1]!]} unit="rp" />);
    const links = screen.getAllByRole("link", { name: /^Diskusi/ });
    expect(links[0]!.getAttribute("aria-label")).toBe("Diskusi 6241 · Langganan fiber kantor (2)");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Diskusi (2)", `/rka/line/${lines[0]!.id}`],
      ["Diskusi", `/rka/line/${lines[1]!.id}`],
    ]);
  });

  it("leaves the link out on the line's own page", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" discussion={false} />);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });

  it("totals revenue and cost separately", () => {
    render(<BudgetGrid priorYear={2026} lines={[lines[0]!, { ...lines[2]!, category: "Revenue" }]} unit="rp" />);
    expect(screen.getByTestId("grand-total-Revenue").textContent).toBe("19.776.000");
    expect(screen.getByTestId("grand-total-Cost").textContent).toBe("237.855.840");
    expect(screen.getByText("Total Pendapatan")).toBeTruthy();
    expect(screen.getByText("Total Biaya")).toBeTruthy();
  });

  it("puts the year total before the months, so it shows without scrolling", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads.indexOf("Total RKA")).toBeLessThan(heads.indexOf("Jan"));
  });

  it("names each line's item and states the unit once", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="juta" />);
    expect(screen.getByRole("link", { name: "6241 · Langganan fiber kantor" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /COA \(.*jt.*\)|COA \(.*[Jj]uta.*\)/ })).toBeTruthy();
  });
});
