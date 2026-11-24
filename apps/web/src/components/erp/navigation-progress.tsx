"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Where the bar starts, and the most it creeps to before the page arrives. */
const START = 12;
const CEILING = 90;
/** A navigation that never lands (a failed load, a link back to the same view) stops the bar after this long. */
const GIVE_UP_MS = 10_000;

const START_EVENT = "estrada:progress-start";
const END_EVENT = "estrada:progress-end";

/** Starts the bar for a change that is not a link click, such as a role switch. Pair it with `endProgress`. */
export const startProgress = () => window.dispatchEvent(new Event(START_EVENT));
export const endProgress = () => window.dispatchEvent(new Event(END_EVENT));

/** Shows the bar for as long as `pending` is true. For selects and buttons that navigate through a transition. */
export function useProgressWhile(pending: boolean) {
  const was = useRef(false);
  useEffect(() => {
    if (pending && !was.current) startProgress();
    if (!pending && was.current) endProgress();
    was.current = pending;
  }, [pending]);
}

/** True for a plain left click on a link to another page of this app, in this tab. */
function leadsElsewhere(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return false;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  return url.pathname !== location.pathname || url.search !== location.search;
}

/**
 * A 3px bar across the top of the window while the next page loads. The App Router has no navigation events,
 * so it starts on a link click and finishes when the URL changes.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [value, setValue] = useState<number | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = useRef(false);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = () => {
    loading.current = false;
    if (trickle.current) clearInterval(trickle.current);
    if (giveUp.current) clearTimeout(giveUp.current);
    setValue(100);
    hide.current = setTimeout(() => setValue(null), 400);
  };

  useEffect(() => {
    const begin = () => {
      loading.current = true;
      if (hide.current) clearTimeout(hide.current);
      if (trickle.current) clearInterval(trickle.current);
      setValue(START);
      // Smaller steps the closer it gets, so it never reaches the end before the page does.
      trickle.current = setInterval(() => setValue((v) => (v === null ? v : Math.min(CEILING, v + (CEILING - v) * 0.1))), 200);
      if (giveUp.current) clearTimeout(giveUp.current);
      giveUp.current = setTimeout(finish, GIVE_UP_MS);
    };
    const onClick = (e: MouseEvent) => {
      if (leadsElsewhere(e)) begin();
    };
    const onEnd = () => {
      if (loading.current) finish();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, begin);
    window.addEventListener(END_EVENT, onEnd);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, begin);
      window.removeEventListener(END_EVENT, onEnd);
    };
  }, []);

  useEffect(() => {
    if (loading.current) finish();
  }, [pathname, search]);

  useEffect(
    () => () => {
      if (trickle.current) clearInterval(trickle.current);
      if (hide.current) clearTimeout(hide.current);
      if (giveUp.current) clearTimeout(giveUp.current);
    },
    [],
  );

  if (value === null) return null;
  return (
    <div
      role="progressbar"
      aria-label="Memuat halaman"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
    >
      <div
        className="bg-primary h-full shadow-[0_0_8px_var(--primary)] transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
        style={{ width: `${value}%`, opacity: value === 100 ? 0 : 1, transitionDuration: value === 100 ? "300ms" : undefined }}
      />
    </div>
  );
}
