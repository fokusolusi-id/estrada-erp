import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApprovalTimeline, type TimelineEvent } from "./approval-timeline";

const events: TimelineEvent[] = [
  { action: "submit", fromState: "draft", toState: "consolidation", actorName: "Rina (SCM)", actorRole: "Requestor", comment: null, at: "2026-10-31T02:01:00.000Z" },
  { action: "return", fromState: "consolidation", toState: "draft", actorName: "Bayu (Head SCM)", actorRole: "Default Owner", comment: "Basis kontrak belum dilampirkan", at: "2026-10-31T02:02:00.000Z" },
];

describe("ApprovalTimeline", () => {
  it("lists who moved the line, newest first, in Jakarta time", () => {
    render(<ApprovalTimeline events={events} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]!.textContent).toContain("Dikembalikan");
    expect(items[0]!.textContent).toContain("Bayu (Head SCM)");
    expect(items[0]!.textContent).toContain("09.02");
    expect(items[1]!.textContent).toContain("Dikirim ke Default Owner");
  });

  it("quotes the reviewer's comment", () => {
    render(<ApprovalTimeline events={events} />);
    expect(screen.getByText("“Basis kontrak belum dilampirkan”")).toBeTruthy();
  });

  it("says when nothing has happened yet", () => {
    render(<ApprovalTimeline events={[]} />);
    expect(screen.getByText("Belum ada riwayat.")).toBeTruthy();
  });
});
