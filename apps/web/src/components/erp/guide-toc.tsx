"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** A heading counts as the one being read once it is in the top third of the window. */
const READING_BAND = "0px 0px -66% 0px";

/** The Panduan contents list; the section being read is highlighted as the reader scrolls. */
export function GuideToc({ sections }: { sections: { id: string; title: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const headings = sections.map((s) => document.getElementById(s.id)).filter((h): h is HTMLElement => !!h);
    const observer = new IntersectionObserver(
      (entries) => {
        const inBand = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
        if (inBand.length) {
          // Several headings in view: the topmost, in reading order.
          setActive(sections.find((s) => inBand.includes(s.id))?.id ?? inBand[0]!);
          return;
        }
        // None in the band (inside a long section, or scrolling back up): the last heading above it.
        const limit = window.innerHeight / 3;
        const above = headings.filter((h) => h.getBoundingClientRect().top < limit);
        if (above.length) setActive(above.at(-1)!.id);
      },
      { rootMargin: READING_BAND },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <ol className="grid gap-0.5 text-sm">
      {sections.map((s) => {
        const on = s.id === active;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={on ? "location" : undefined}
              onClick={() => setActive(s.id)}
              className={cn(
                "block rounded-md border-l-2 px-2 py-1 transition-colors",
                on ? "border-primary bg-primary/5 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent",
              )}
            >
              {s.title}
            </a>
          </li>
        );
      })}
    </ol>
  );
}
