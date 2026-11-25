export interface Page<T> {
  items: T[];
  page: number;
  pages: number;
  total: number;
  /** 1-based position of the first and last item shown; 0 when the list is empty. */
  from: number;
  to: number;
}

/** One page of a long list. `raw` is the page number as it arrives in the URL; anything that is not a whole number from 1 counts as page 1, and a page past the end shows the last. */
export function paginate<T>(list: readonly T[], raw: string | undefined, size: number): Page<T> {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const asked = raw && /^\d+$/.test(raw) ? Number(raw) : 1;
  const page = Math.min(Math.max(asked, 1), pages);
  const start = (page - 1) * size;
  const items = list.slice(start, start + size);
  return { items, page, pages, total, from: items.length ? start + 1 : 0, to: start + items.length };
}
