"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];
export const THEME_LABEL: Record<Theme, string> = { light: "Terang", dark: "Gelap", system: "Ikuti sistem" };

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const listeners = new Set<() => void>();
function read(): Theme {
  try {
    const s = localStorage.getItem("theme");
    if (s === "light" || s === "dark") return s;
  } catch {}
  return "system";
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => apply(read());
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onChange);
  };
}

/** The stored theme choice and how to change it. The inline script in the root layout applies it before first paint. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const setTheme = (next: Theme) => {
    try {
      localStorage.setItem("theme", next);
    } catch {}
    apply(next);
    listeners.forEach((l) => l());
  };
  return [theme, setTheme] as const;
}
