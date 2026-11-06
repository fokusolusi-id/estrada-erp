"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["light", "dark", "system"];
const LABEL: Record<Theme, string> = { light: "Terang", dark: "Gelap", system: "Ikuti sistem" };

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

/** Cycles light → dark → system. The inline script in the root layout applies the stored choice before first paint. */
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`Tema: ${LABEL[theme]}. Ganti ke ${LABEL[next]}`}
      title={`Tema: ${LABEL[theme]}`}
      onClick={() => {
        try {
          localStorage.setItem("theme", next);
        } catch {}
        apply(next);
        listeners.forEach((l) => l());
      }}
    >
      <Icon />
    </Button>
  );
}
