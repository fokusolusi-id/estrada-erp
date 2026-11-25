import { describe, expect, it } from "vitest";
import { paginate } from "../src/paging";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginate: a long list shows one page at a time", () => {
  it("returns the first page by default", () => {
    const p = paginate(rows(120), undefined, 50);
    expect(p.items).toHaveLength(50);
    expect(p.items[0]).toBe(1);
    expect(p).toMatchObject({ page: 1, pages: 3, total: 120, from: 1, to: 50 });
  });

  it("returns the remainder on the last page", () => {
    const p = paginate(rows(120), "3", 50);
    expect(p.items).toEqual(rows(120).slice(100));
    expect(p).toMatchObject({ page: 3, from: 101, to: 120 });
  });

  it("clamps a page past the end or below one, and ignores garbage", () => {
    expect(paginate(rows(120), "9", 50).page).toBe(3);
    expect(paginate(rows(120), "0", 50).page).toBe(1);
    expect(paginate(rows(120), "-4", 50).page).toBe(1);
    expect(paginate(rows(120), "abc", 50).page).toBe(1);
    expect(paginate(rows(120), "2.7", 50).page).toBe(1);
  });

  it("keeps a short list on one page and an empty list at page 1", () => {
    expect(paginate(rows(10), "2", 50)).toMatchObject({ page: 1, pages: 1, from: 1, to: 10 });
    expect(paginate([], undefined, 50)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});
