import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleSwitcher } from "./role-switcher";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./position-actions", () => ({ actAs: vi.fn(async () => ({ ok: true })) }));

const options = [
  { id: "a", group: "Default Owner", label: "Head of FRM · FRM" },
  { id: "b", group: "Default Owner", label: "Head of SCM · SCM" },
  { id: "c", group: "Requestor", label: "Staff SCM · SCM" },
  { id: "d", group: "Default Owner", label: "Kepala Finance · FRM-FIN" },
];

describe("RoleSwitcher", () => {
  it("groups the seats by role, in the order the roles first appear, so a long list stays scannable", () => {
    render(<RoleSwitcher options={options} activeId={null} />);
    const select = screen.getByLabelText("Bertindak sebagai") as HTMLSelectElement;
    const groups = Array.from(select.querySelectorAll("optgroup")).map((g) => [g.label, Array.from(g.querySelectorAll("option")).map((o) => o.textContent)]);
    expect(groups).toEqual([
      ["Default Owner", ["Head of FRM · FRM", "Head of SCM · SCM", "Kepala Finance · FRM-FIN"]],
      ["Requestor", ["Staff SCM · SCM"]],
    ]);
  });

  it("keeps Admin (saya sendiri) first, outside any group, and marks the active seat", () => {
    render(<RoleSwitcher options={options} activeId="c" />);
    const select = screen.getByLabelText("Bertindak sebagai") as HTMLSelectElement;
    expect(select.options[0]!.textContent).toBe("Admin (saya sendiri)");
    expect(select.options[0]!.parentElement).toBe(select);
    expect(select.value).toBe("c");
  });

  it("still lists seats that carry no group", () => {
    render(<RoleSwitcher options={[{ id: "x", label: "Seat tanpa grup" }]} activeId={null} />);
    expect(screen.getByRole("option", { name: "Seat tanpa grup" })).toBeTruthy();
  });
});
