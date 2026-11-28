"use client";

import * as React from "react";

/**
 * The box around a table. It names the table after its card, and when the table overflows it can be focused,
 * so a keyboard can scroll it.
 */
export function TableFrame(props: React.ComponentProps<"div">) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const box = ref.current;
    const table = box?.querySelector("table");
    if (!box || !table) return;
    // The title's own text, without any link that sits beside it.
    const name = box.closest("[data-slot=card]")?.querySelector("[data-slot=card-title]")?.firstChild?.textContent?.trim();
    if (name && !table.caption && !table.hasAttribute("aria-label")) table.setAttribute("aria-label", name);
    const fit = () => {
      if (box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight) {
        box.tabIndex = 0;
        box.setAttribute("role", "region");
        box.setAttribute("aria-label", `Gulir tabel ${name ?? ""}`.trim());
      } else {
        for (const attribute of ["tabindex", "role", "aria-label"]) box.removeAttribute(attribute);
      }
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    watch.observe(table);
    return () => watch.disconnect();
  });
  return <div ref={ref} {...props} />;
}
