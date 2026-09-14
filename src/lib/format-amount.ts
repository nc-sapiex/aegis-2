/**
 * Indian digit grouping: the last three digits, then pairs of two
 * (12,34,567 not 1,234,567). Lakh/crore words appear only in free text,
 * never in this formatter (spec §6.2 Q27).
 */
export function formatAmount(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  const [whole, fraction = "00"] = num.toFixed(2).split(".");
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;

  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped =
    rest.length > 0
      ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
      : lastThree;

  return `${negative ? "-" : ""}₹${grouped}.${fraction}`;
}
