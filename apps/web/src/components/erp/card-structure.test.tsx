// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

describe("structure for screen readers", () => {
  afterEach(cleanup);

  it("makes a card title a heading", () => {
    render(<CardTitle>Arus kas</CardTitle>);
    expect(screen.getByRole("heading", { level: 2, name: "Arus kas" })).toBeTruthy();
  });

  it("names a table after its card", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>
            Obligo bank<a href="/obligo">Rincian</a>
          </CardTitle>
        </CardHeader>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>x</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>,
    );
    expect(screen.getByRole("table", { name: "Obligo bank" })).toBeTruthy();
  });
});
