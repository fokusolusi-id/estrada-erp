import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UserMenu } from "./user-menu";

const replace = vi.fn();
const signOut = vi.fn(async () => {});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth-client", () => ({ signOut: () => signOut() }));

// jsdom lacks what Radix reads when it positions a menu.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

const open = () => fireEvent.keyDown(screen.getByRole("button", { name: /Menu pengguna/ }), { key: "Enter" });

describe("UserMenu", () => {
  it("shows the user's initials and name on the button", () => {
    render(<UserMenu name="Dedy Wahyudi" email="dedy@example.com" detail="Finance · Finance Reviewer" />);
    const button = screen.getByRole("button", { name: "Menu pengguna, Dedy Wahyudi" });
    expect(button.textContent).toContain("DW");
    expect(button.textContent).toContain("Dedy Wahyudi");
  });

  it("opens with who the user is, and signs out from Keluar", async () => {
    render(<UserMenu name="Dedy Wahyudi" email="dedy@example.com" detail="Finance · Finance Reviewer" />);
    open();
    expect(await screen.findByText("dedy@example.com")).toBeTruthy();
    expect(screen.getByText("Finance · Finance Reviewer")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Keluar" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(signOut).toHaveBeenCalled();
  });
});
