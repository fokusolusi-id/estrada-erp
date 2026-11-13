import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationBell, type BellItem } from "./notification-bell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const items: BellItem[] = [
  { id: "a", text: "Usulan RKA dikembalikan: perlu diubah", link: "/rka", when: "13 Nov 09.00", unread: true, needsChange: true },
  { id: "b", text: "Komentar baru di diskusi baris RKA", link: "/rka/line/1", when: "12 Nov 15.30", unread: false, needsChange: false },
];

describe("NotificationBell", () => {
  it("shows how many notifications are unread on the bell", () => {
    render(<NotificationBell items={items} unread={1} onRead={vi.fn(async () => {})} />);
    expect(screen.getByRole("button", { name: "Notifikasi, 1 belum dibaca" })).toBeTruthy();
    expect(screen.getByTestId("unread-badge").textContent).toBe("1");
  });

  it("lists the notifications with links when opened, marking change requests", () => {
    render(<NotificationBell items={items} unread={1} onRead={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifikasi/ }));
    expect(screen.getByRole("link", { name: /Usulan RKA dikembalikan/ }).getAttribute("href")).toBe("/rka");
    expect(screen.getByText("Perlu diubah")).toBeTruthy();
  });

  it("marks a notification read when it is opened, and all of them from one button", async () => {
    const onRead = vi.fn(async () => {});
    render(<NotificationBell items={items} unread={1} onRead={onRead} />);
    fireEvent.click(screen.getByRole("button", { name: /Notifikasi/ }));
    fireEvent.click(screen.getByRole("link", { name: /Usulan RKA dikembalikan/ }));
    await waitFor(() => expect(onRead).toHaveBeenCalledWith("a"));
    fireEvent.click(screen.getByRole("button", { name: /Notifikasi/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tandai semua dibaca" }));
    await waitFor(() => expect(onRead).toHaveBeenLastCalledWith(undefined));
  });

  it("says so when there is nothing yet", () => {
    render(<NotificationBell items={[]} unread={0} onRead={vi.fn(async () => {})} />);
    fireEvent.click(screen.getByRole("button", { name: "Notifikasi" }));
    expect(screen.getByText("Belum ada notifikasi.")).toBeTruthy();
  });
});
