import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectDrop } from "./project-drop";

const drop = () => vi.fn<(reason: string) => Promise<{ ok: boolean; message: string }>>(async () => ({ ok: true, message: "ok" }));

describe("ProjectDrop", () => {
  it("needs a reason, then a second confirmation, before dropping", async () => {
    const onDrop = drop();
    render(<ProjectDrop onDrop={onDrop} />);
    const first = screen.getByRole("button", { name: "Hentikan proyek (Drop)" });
    expect(first).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Alasan proyek dihentikan"), { target: { value: "Kontrak dibatalkan pelanggan" } });
    fireEvent.click(first);
    expect(onDrop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ya, hentikan proyek" }));
    await waitFor(() => expect(onDrop).toHaveBeenCalledWith("Kontrak dibatalkan pelanggan"));
  });

  it("can be cancelled at the confirmation", () => {
    const onDrop = drop();
    render(<ProjectDrop onDrop={onDrop} />);
    fireEvent.change(screen.getByLabelText("Alasan proyek dihentikan"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Hentikan proyek (Drop)" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(screen.getByRole("button", { name: "Hentikan proyek (Drop)" })).toBeTruthy();
    expect(onDrop).not.toHaveBeenCalled();
  });
});
