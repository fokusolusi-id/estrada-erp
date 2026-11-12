import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentDocuments } from "./payment-documents";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const docs = [
  { id: "d1", kind: "invoice" as const, fileName: "INV-1029.pdf", size: 240_000 },
  { id: "d2", kind: "proof" as const, fileName: "transfer.jpg", size: 1_800_000 },
];

describe("PaymentDocuments", () => {
  it("lists the documents with links that go through the app", () => {
    render(<PaymentDocuments requestId="p1" docs={docs} editable={false} onUpload={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole("link", { name: "INV-1029.pdf" }).getAttribute("href")).toBe("/pembayaran/p1/dokumen/d1");
    expect(screen.getByText("Bukti bayar")).toBeTruthy();
    expect(screen.getByText("1,7 MB")).toBeTruthy();
    expect(screen.queryByLabelText("File dokumen")).toBeNull();
    expect(screen.queryByRole("button", { name: /Hapus/ })).toBeNull();
  });

  it("lets the requester attach and remove while the request is theirs, never the proof", async () => {
    const onUpload = vi.fn(async () => ({ ok: true, message: "Dokumen dilampirkan." }));
    const onRemove = vi.fn(async () => ({ ok: true, message: "Dokumen dihapus." }));
    render(<PaymentDocuments requestId="p1" docs={docs} editable onUpload={onUpload} onRemove={onRemove} />);
    expect(screen.queryByRole("button", { name: "Hapus transfer.jpg" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hapus INV-1029.pdf" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("d1"));
    expect(await screen.findByText("Dokumen dihapus.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Jenis dokumen"), { target: { value: "faktur_pajak" } });
    const file = new File(["%PDF"], "faktur.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("File dokumen"), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole("button", { name: "Lampirkan" }).closest("form")!);
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    const sent = (onUpload.mock.calls[0] as unknown as [FormData])[0];
    expect(sent.get("kind")).toBe("faktur_pajak");
    expect(sent.get("requestId")).toBe("p1");
    expect(await screen.findByText("Dokumen dilampirkan.")).toBeTruthy();
  });
});
