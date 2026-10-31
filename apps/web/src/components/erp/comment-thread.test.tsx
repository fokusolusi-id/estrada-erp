import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentThread, type ThreadComment } from "./comment-thread";

const comments: ThreadComment[] = [
  { id: "c1", authorName: "Sari (Finance)", authorRole: "Finance", body: "Tarif bandwidth naik 10% dari kontrak mana?", at: "2026-11-02T02:05:00.000Z" },
  { id: "c2", authorName: "Rina (SCM)", authorRole: "Requestor", body: "Kontrak Telkom 2027, lampiran sudah di basis.", at: "2026-11-02T03:40:00.000Z" },
];
const post = (ok = true) => vi.fn(async () => ({ ok, message: ok ? "Komentar terkirim." : "Anda tidak dapat berkomentar pada baris ini." }));

describe("CommentThread", () => {
  it("reads oldest first, like a conversation, in Jakarta time", () => {
    render(<CommentThread comments={comments} canPost onPost={post()} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]!.textContent).toContain("Sari (Finance)");
    expect(items[0]!.textContent).toContain("09.05");
    expect(items[1]!.textContent).toContain("Kontrak Telkom 2027");
  });

  it("posts the text, clears the box and shows the result", async () => {
    const onPost = post();
    render(<CommentThread comments={[]} canPost onPost={onPost} />);
    expect(screen.getByText("Belum ada komentar.")).toBeTruthy();
    const box = screen.getByLabelText("Komentar") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  Mohon lampirkan kontrak  " } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim komentar" }));
    await waitFor(() => expect(onPost).toHaveBeenCalledWith("Mohon lampirkan kontrak"));
    expect(await screen.findByText("Komentar terkirim.")).toBeTruthy();
    expect(box.value).toBe("");
  });

  it("keeps the text when posting fails", async () => {
    render(<CommentThread comments={[]} canPost onPost={post(false)} />);
    const box = screen.getByLabelText("Komentar") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "Pertanyaan" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim komentar" }));
    expect(await screen.findByText("Anda tidak dapat berkomentar pada baris ini.")).toBeTruthy();
    expect(box.value).toBe("Pertanyaan");
  });

  it("does not send an empty comment", () => {
    render(<CommentThread comments={[]} canPost onPost={post()} />);
    expect((screen.getByRole("button", { name: "Kirim komentar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is read-only for those who cannot post, and says why", () => {
    render(<CommentThread comments={comments} canPost={false} closedReason="Baris sudah dikunci; diskusi ditutup." onPost={post()} />);
    expect(screen.queryByLabelText("Komentar")).toBeNull();
    expect(screen.getByText("Baris sudah dikunci; diskusi ditutup.")).toBeTruthy();
  });
});
