// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AuthLayout from "./layout";

describe("sign-in panel", () => {
  afterEach(cleanup);

  it("introduces the app as an ERP by listing its modules, not only the RKA flow", () => {
    render(<AuthLayout>form</AuthLayout>);
    const list = screen.getByRole("list", { name: "Modul ERP" });
    expect(within(list).getAllByRole("listitem").map((li) => li.querySelector("span:last-child > span")?.textContent)).toEqual([
      "RKA",
      "Pipeline",
      "Implementasi",
      "Pembayaran",
      "Arus Kas",
      "COA Master",
    ]);
  });

  it("joins each module's dot to the next one with a line", () => {
    render(<AuthLayout>form</AuthLayout>);
    const items = within(screen.getByRole("list", { name: "Modul ERP" })).getAllByRole("listitem");
    expect(items.map((li) => li.querySelectorAll("[data-connector]").length)).toEqual([1, 1, 1, 1, 1, 0]);
  });
});
