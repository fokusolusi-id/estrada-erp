import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserMenu } from "./user-menu";
import { ViewAsChip } from "./view-as-chip";

const replace = vi.fn();
const signOut = vi.fn(async () => {});
const switchPosition = vi.fn(async () => ({ ok: true }));
const actAs = vi.fn(async () => ({ ok: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: () => signOut() }));
vi.mock("@/app/(app)/position-actions", () => ({
  switchPosition: (...a: unknown[]) => switchPosition(...(a as [])),
  actAs: (...a: unknown[]) => actAs(...(a as [])),
}));

// jsdom lacks what Radix reads when it positions a menu, and what the theme reads.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
beforeEach(() => vi.clearAllMocks());

const me = { name: "Dedy Wahyudi", email: "dedy@example.com", title: "Business Finance", subtitle: "Finance Reviewer" };
const open = () => fireEvent.keyDown(screen.getByRole("button", { name: /Menu pengguna/ }), { key: "Enter" });
const seats = [
  { id: "a", group: "Default Owner", label: "Head of FRM · FRM" },
  { id: "c", group: "Requestor", label: "Staff SCM · SCM" },
  { id: "d", group: "Default Owner", label: "Kepala Finance · FRM-FIN" },
];

describe("UserMenu", () => {
  it("shows initials and the seat held, not only the name, on the button", () => {
    render(<UserMenu {...me} />);
    const button = screen.getByRole("button", { name: "Menu pengguna, Dedy Wahyudi" });
    expect(button.textContent).toContain("DW");
    expect(button.textContent).toContain("Business Finance");
    expect(button.textContent).toContain("Finance Reviewer");
  });

  it("opens with who the user is, and signs out from Keluar", async () => {
    render(<UserMenu {...me} />);
    open();
    expect(await screen.findByText("dedy@example.com")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Keluar" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalled();
  });

  it("holds the theme choice", async () => {
    render(<UserMenu {...me} />);
    open();
    expect((await screen.findByRole("menuitemradio", { name: "Ikuti sistem" })).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Gelap" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("switches between the positions a user holds", async () => {
    render(
      <UserMenu
        {...me}
        positions={{
          activeId: "p1",
          options: [
            { id: "p1", label: "Business Finance · Finance Reviewer · FRM" },
            { id: "p2", label: "Head of SCM · Default Owner · SCM (pjs)" },
          ],
        }}
      />,
    );
    open();
    expect((await screen.findByRole("menuitemradio", { name: /Business Finance/ })).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Head of SCM/ }));
    await waitFor(() => expect(switchPosition).toHaveBeenCalledWith("p2"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("offers positions only to someone with more than one", async () => {
    render(<UserMenu {...me} />);
    open();
    await screen.findByText("dedy@example.com");
    expect(screen.queryByText("Posisi aktif")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Bertindak sebagai/ })).toBeNull();
  });

  it("lets Admin act as a seat, the seats grouped by role in the order roles first appear", async () => {
    render(<UserMenu {...me} viewAs={{ activeId: null, options: seats }} />);
    open();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Bertindak sebagai/ }));
    const names = screen.getAllByRole("menuitemradio").map((i) => i.textContent);
    expect(names).toEqual(["Admin (saya sendiri)", "Head of FRM · FRM", "Kepala Finance · FRM-FIN", "Staff SCM · SCM"]);
    expect(screen.getByText("Default Owner")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Staff SCM · SCM" }));
    await waitFor(() => expect(actAs).toHaveBeenCalledWith("c"));
  });
});

describe("ViewAsChip", () => {
  it("says whose view this is and goes back to Admin", async () => {
    render(<ViewAsChip label="Staff SCM · SCM" />);
    expect(screen.getByRole("status").textContent).toContain("Melihat sebagai Staff SCM · SCM");
    fireEvent.click(screen.getByRole("button", { name: "Kembali ke Admin" }));
    await waitFor(() => expect(actAs).toHaveBeenCalledWith(null));
  });
});
