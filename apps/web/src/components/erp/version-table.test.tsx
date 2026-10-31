import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VersionTable, type VersionRow } from "./version-table";

const now = new Date("2026-11-12T02:00:00Z"); // 12 Nov 09:00 WIB
const rows: VersionRow[] = [
  { id: "v3", name: "RKA 2027 Upd Fin v3", fiscalYear: 2027, status: "open", deadline: new Date("2026-11-15T10:00:00Z"), copiedFrom: "RKA 2027 Upd Fin v2", byState: { draft: 150, consolidation: 30, locked: 0 } },
  { id: "v2", name: "RKA 2027 Upd Fin v2", fiscalYear: 2027, status: "locked", deadline: null, copiedFrom: null, byState: { locked: 192 } },
  { id: "v1", name: "RKA 2027 (demo)", fiscalYear: 2027, status: "archived", deadline: null, copiedFrom: null, byState: {} },
];

describe("VersionTable", () => {
  it("labels each version's status in Bahasa Indonesia", () => {
    render(<VersionTable rows={rows} now={now} />);
    expect(within(screen.getByTestId("version-v3")).getByText("Terbuka")).toBeTruthy();
    expect(within(screen.getByTestId("version-v2")).getByText("Terkunci")).toBeTruthy();
    expect(within(screen.getByTestId("version-v1")).getByText("Diarsipkan")).toBeTruthy();
  });

  it("shows the deadline with the days left in Jakarta time", () => {
    render(<VersionTable rows={rows} now={now} />);
    expect(within(screen.getByTestId("version-v3")).getByText(/3 hari lagi/)).toBeTruthy();
  });

  it("counts lines per approval state and names the version it was revised from", () => {
    render(<VersionTable rows={rows} now={now} />);
    const v3 = screen.getByTestId("version-v3");
    expect(within(v3).getByText("180 baris")).toBeTruthy();
    expect(within(v3).getByText("Draft 150 · Konsolidasi 30")).toBeTruthy();
    expect(within(v3).getByText("Revisi dari RKA 2027 Upd Fin v2")).toBeTruthy();
  });
});
