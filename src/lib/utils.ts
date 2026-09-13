import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names while resolving conflicting utility sets.
 *
 * This wrapper keeps UI styling deterministic by letting clsx collect
 * conditionals and twMerge collapse duplicate Tailwind utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date using the Indian English locale used across the platform.
 *
 * @param date - ISO string or Date instance to format.
 * @param format - Whether to show the month as a short or long label.
 * @returns A localized date string such as "13 Sept 2026".
 */
export function formatDate(
  date: string | Date,
  format: "short" | "long" = "short",
) {
  const d = typeof date === "string" ? new Date(date) : date;

  // The app intentionally uses the India locale for date presentation, which
  // matches the bank/regulatory audience and the existing UI expectations.
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: format === "long" ? "long" : "short",
    year: "numeric",
  });
}
