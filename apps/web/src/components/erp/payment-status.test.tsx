import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentStatusBadge, PaymentStepper } from "./payment-status";

const states = () => [...screen.getByTestId("payment-stepper").querySelectorAll("li")].map((li) => li.getAttribute("data-state"));

describe("PaymentStepper", () => {
  it("shows the steps done and the one waiting", () => {
    render(<PaymentStepper state="pending_approval" />);
    expect(states()).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
    expect(screen.getByText("Head Divisi")).toBeTruthy();
  });

  it("marks where a returned request was sent back from", () => {
    render(<PaymentStepper state="returned" returnedFrom="under_review" />);
    expect(states()).toEqual(["done", "returned", "todo", "todo", "todo", "todo"]);
    expect(screen.getByText("Dikembalikan ke pemohon")).toBeTruthy();
  });

  it("ticks every step once paid, and nothing in a draft", () => {
    const { unmount } = render(<PaymentStepper state="paid" />);
    expect(states()).toEqual(["done", "done", "done", "done", "done", "done"]);
    unmount();
    render(<PaymentStepper state="draft" />);
    expect(states()).toEqual(["todo", "todo", "todo", "todo", "todo", "todo"]);
  });
});

describe("PaymentStatusBadge", () => {
  it("uses the team's status names with their explanation", () => {
    render(<PaymentStatusBadge state="under_review" />);
    expect(screen.getByText("Under Review").closest("[title]")?.getAttribute("title")).toBe("Sedang diperiksa BFP");
  });
});
