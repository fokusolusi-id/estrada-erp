import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UnitSwitch } from "./unit-switch";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("UnitSwitch", () => {
  it("offers angka penuh, juta and miliar, and saves the viewer's pick", async () => {
    const onChange = vi.fn(async () => {});
    render(<UnitSwitch value="juta" onChange={onChange} />);
    const select = screen.getByLabelText("Satuan") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Angka penuh", "Juta", "Miliar"]);
    expect(select.value).toBe("juta");
    fireEvent.change(select, { target: { value: "miliar" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("miliar"));
  });
});
