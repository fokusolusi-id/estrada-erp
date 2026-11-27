import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ActivityList, PendingStages } from "./home-overview";

const pending = [
  { state: "draft" as const, role: "requestor" as const, count: 187, divisions: [{ division: "BCD", count: 140 }, { division: "HCM", count: 47 }] },
  { state: "finance_review" as const, role: "finance" as const, count: 5, divisions: [{ division: "PDMS", count: 5 }] },
];

describe("PendingStages", () => {
  it("names who holds the unfinished lines and links to them", () => {
    render(<PendingStages pending={pending} hrefFor={(s, d) => `/rka?status=${s}${d ? `&divisi=${d}` : ""}`} />);
    const draft = screen.getByRole("link", { name: /187 baris/ });
    expect(draft.getAttribute("href")).toBe("/rka?status=draft");
    expect(draft.textContent).toContain("Draft");
    expect(draft.textContent).toContain("di Requestor");
  });

  it("names the divisions to chase, largest first, each linked to its lines", () => {
    render(<PendingStages pending={pending} hrefFor={(s, d) => `/rka?status=${s}${d ? `&divisi=${d}` : ""}`} />);
    expect(screen.getByRole("link", { name: "BCD 140" }).getAttribute("href")).toBe("/rka?status=draft&divisi=BCD");
    expect(screen.getByRole("link", { name: "HCM 47" })).toBeTruthy();
  });

  it("shows plain rows when the reader has no line list", () => {
    render(<PendingStages pending={pending} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("187 baris")).toBeTruthy();
  });

  it("says so when everything is final", () => {
    render(<PendingStages pending={[]} />);
    expect(screen.getByText("Semua baris sudah final.")).toBeTruthy();
  });
});

describe("ActivityList", () => {
  const line = (lineId: string) => ({ lineId, coaCode: "6241", name: "Langganan fiber" });
  const base = { actorName: "Rina", actorRole: "Requestor", action: "submit" as const, at: "2026-11-01T02:00:00.000Z" };

  it("names the line moved, not only its COA code", () => {
    render(<ActivityList groups={[{ ...base, events: [{ ...base, ...line("a") }] }]} />);
    const link = screen.getByRole("link", { name: "6241 · Langganan fiber" });
    expect(link.getAttribute("href")).toBe("/rka/line/a");
  });

  it("counts the lines of a batch handoff", () => {
    render(<ActivityList groups={[{ ...base, events: [{ ...base, ...line("a") }, { ...base, ...line("b") }] }]} />);
    const item = within(screen.getByRole("listitem"));
    expect(item.getByText("2 baris", { exact: false })).toBeTruthy();
    expect(item.queryByRole("link")).toBeNull();
  });
});
