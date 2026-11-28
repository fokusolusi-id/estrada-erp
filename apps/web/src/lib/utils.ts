import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type steps of globals.css. Unregistered, `text-figure` reads as a colour and `text-destructive` replaces it.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["figure", "page", "section"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
