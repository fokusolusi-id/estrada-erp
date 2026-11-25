import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Pager } from "./pager";

const page = { page: 2, pages: 3, total: 120, from: 51, to: 100 };

describe("Pager", () => {
  it("says which rows are shown and links to the neighbouring pages", () => {
    render(<Pager {...page} />);
    expect(screen.getByText("Baris 51–100 dari 120")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sebelumnya" }).getAttribute("href")).toBe("?hal=1");
    expect(screen.getByRole("link", { name: "Berikutnya" }).getAttribute("href")).toBe("?hal=3");
  });

  it("has no previous link on the first page and no next link on the last", () => {
    const { rerender } = render(<Pager {...page} page={1} from={1} to={50} />);
    expect(screen.queryByRole("link", { name: "Sebelumnya" })).toBeNull();
    rerender(<Pager {...page} page={3} from={101} to={120} />);
    expect(screen.queryByRole("link", { name: "Berikutnya" })).toBeNull();
  });

  it("shows nothing when everything fits on one page", () => {
    const { container } = render(<Pager page={1} pages={1} total={10} from={1} to={10} />);
    expect(container.innerHTML).toBe("");
  });
});
