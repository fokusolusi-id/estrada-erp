import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Table, TableBody } from "./table";

describe("Table scroll", () => {
  it("keeps a long table inside its own box with the header in view", () => {
    const { container } = render(
      <Table scroll>
        <TableBody />
      </Table>,
    );
    const box = container.querySelector("[data-slot=table-container]")!;
    expect(box.className).toContain("max-h-[70vh]");
    expect(box.className).toContain("[&_thead]:sticky");
  });
});
