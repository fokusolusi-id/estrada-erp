import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { money } from "@estrada/domain";
import { BudgetGrid, type GridLine } from "./budget-grid";

const flat = (a: string) => Array.from({ length: 12 }, () => money(a));

const lines: GridLine[] = [
  { id: "a", coaCode: "6241", coaName: "Beban internet", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("19821320"), state: "draft" },
  { id: "c", coaCode: "6291", coaName: "Beban penyusutan gedung", entity: "ESTRADA", requestorUnit: "FRM", ownerUnit: "FRM", months: flat("11145836"), state: "draft", priorRka: null, priorActual: money("127920227"), flags: ["Cek potensi double counting dengan RKA HCM"] },
  { id: "b", coaCode: "6243", coaName: "Beban telekomunikasi", entity: "ESTRADA", requestorUnit: "SCM", ownerUnit: "SCM", months: flat("1648000"), state: "consolidation" },
];

describe("BudgetGrid", () => {
  it("computes each line total from the 12 months", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("total-a").textContent).toBe("Rp 237.855.840");
  });

  it("shows a grand total across lines", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("grand-total").textContent).toBe("Rp 391.381.872");
  });

  it("drops the Entitas column once the header narrows to one entity", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" hide={{ entity: true }} />);
    expect(screen.queryByRole("columnheader", { name: "Entitas" })).toBeNull();
    expect(screen.getByTestId("grand-total").textContent).toBe("Rp 391.381.872");
  });

  it("labels approval state in Bahasa Indonesia", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} />);
    expect(screen.getByText("Konsolidasi")).toBeTruthy();
  });

  it("shows Actual 2026 and the change beside each line", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTestId("actual-c").textContent).toBe("Rp 127.920.227");
    expect(screen.getByTestId("actual-a").textContent).toBe("—");
  });

  it("flags lines the workbook marked for review", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" />);
    expect(screen.getByTitle("Cek potensi double counting dengan RKA HCM").textContent).toBe("Perlu review");
  });

  it("links each line to its discussion, with the comment count", () => {
    render(<BudgetGrid priorYear={2026} lines={[{ ...lines[0]!, commentCount: 2 }, lines[1]!]} unit="rp" />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Diskusi (2)", `/rka/line/${lines[0]!.id}`],
      ["Diskusi", `/rka/line/${lines[1]!.id}`],
    ]);
  });

  it("leaves the link out on the line's own page", () => {
    render(<BudgetGrid priorYear={2026} lines={lines} unit="rp" discussion={false} />);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
