import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@/data-access/pack-catalog";

export function InstalledPacksList({ catalog }: { catalog: CatalogEntry[] }) {
  if (catalog.length === 0) return null;
  return (
    <dl className="divide-y divide-[color:hsl(var(--border))] border-t border-[color:hsl(var(--border))]">
      {catalog.map((entry) => (
        <div
          key={entry.packCode}
          className={cn(
            "flex items-center justify-between py-2",
            entry.status === "not-licensed" && "opacity-50",
          )}
        >
          <dt className="text-[13px]">
            {entry.name}{" "}
            <span className="ml-1 rounded-[2px] border border-[color:hsl(var(--border-strong))] px-1.5 py-0.5 text-[11px] tracking-[0.06em] text-[color:hsl(var(--muted-foreground))] uppercase">
              {entry.packCode}
            </span>
          </dt>
          <dd className="text-[13px] text-[color:hsl(var(--muted-foreground))]">
            {entry.status === "not-licensed" ? entry.message : entry.status}
          </dd>
        </div>
      ))}
    </dl>
  );
}
