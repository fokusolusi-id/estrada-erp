import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { orgChart } from "@estrada/domain";
import { OrgChart } from "./org-chart";

const roots = orgChart(
  [
    { code: "DIR", name: "Direksi", type: "company", parent: null },
    { code: "PDMS", name: "Project Delivery", type: "division", parent: "DIR" },
    { code: "SCM", name: "Supply Chain", type: "department", parent: "PDMS" },
    { code: "SCM-VM", name: "Vendor Mgmt", type: "unit", parent: "SCM" },
  ],
  [
    { id: "p1", orgUnit: "SCM", title: "Kepala SCM", role: "default_owner", holder: "u1", acting: null },
    { id: "p2", orgUnit: "PDMS", title: "Kepala PDMS", role: "division_owner", holder: null, acting: "u2" },
    { id: "p3", orgUnit: "SCM", title: "Staf SCM", role: "requestor", holder: null, acting: null },
    { id: "p4", orgUnit: "SCM-VM", title: "Vendor Mgmt", role: "requestor", holder: null, acting: null, holderName: "Oky" },
  ],
);
const names = new Map([
  ["u1", "Budi"],
  ["u2", "Sari"],
]);

describe("OrgChart", () => {
  it("shows each unit with its people, pjs and empty seats, each linking to the position", () => {
    render(<OrgChart roots={roots} nameOf={names} />);
    const scm = within(screen.getByTestId("unit-SCM"));
    expect(scm.getByText("Budi").closest("a")!.getAttribute("href")).toBe("/admin/positions/p1");
    expect(scm.getByText("Kosong")).toBeTruthy();
    expect(within(screen.getByTestId("unit-PDMS")).getByText("pjs Sari")).toBeTruthy();
  });

  it("counts empty seats below a unit and offers a new position in it", () => {
    render(<OrgChart roots={roots} nameOf={names} />);
    expect(within(screen.getByTestId("unit-DIR")).getByText("1 kosong")).toBeTruthy();
    expect(within(screen.getByTestId("unit-SCM")).getByText("Tambah posisi").closest("a")!.getAttribute("href")).toBe("/admin/positions?tampilan=daftar&unit=SCM#buat");
  });

  it("draws sections inside their department's card with the name from the document", () => {
    render(<OrgChart roots={roots} nameOf={names} />);
    const section = within(within(screen.getByTestId("unit-SCM")).getByTestId("unit-SCM-VM"));
    expect(section.getByText("Vendor Mgmt")).toBeTruthy();
    expect(section.getByText("Oky").closest("a")!.getAttribute("href")).toBe("/admin/positions/p4");
  });
});

describe("OrgChart staff units", () => {
  it("puts a department reporting to the Direktur on the trunk, before the division row", () => {
    const chart = orgChart(
      [
        { code: "DIR", name: "Direktur", type: "company", parent: null },
        { code: "SGV", name: "Strategic Growth & Ventures", type: "department", parent: "DIR" },
        { code: "BCD", name: "Business Commercial", type: "division", parent: "DIR" },
      ],
      [],
    );
    render(<OrgChart roots={chart} nameOf={new Map()} />);
    const staffRow = screen.getByTestId("org-staff");
    expect(within(staffRow).getByTestId("unit-SGV")).toBeTruthy();
    expect(within(staffRow).queryByTestId("unit-BCD")).toBeNull();
    expect(staffRow.compareDocumentPosition(screen.getByTestId("unit-BCD")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
