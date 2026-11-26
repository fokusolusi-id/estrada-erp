/** Scrolls a list just far enough to show the item, moving only the list and never the page. */
export function keepInView(list: Element | null, item: Element | null | undefined) {
  if (!list || !item) return;
  const view = list.getBoundingClientRect();
  const at = item.getBoundingClientRect();
  if (at.top < view.top) list.scrollTop -= view.top - at.top;
  else if (at.bottom > view.bottom) list.scrollTop += at.bottom - view.bottom;
}
