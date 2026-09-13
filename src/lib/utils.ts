import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: string | Date,
  format: "short" | "long" = "short",
) {
  const d = typeof date === "string" ? new Date(date) : date;

  // en-IN matches the bank/regulatory audience, not the user's own locale.
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: format === "long" ? "long" : "short",
    year: "numeric",
  });
}
