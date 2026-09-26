"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { CatalogEntry } from "@/data-access/pack-catalog";
import { uninstallPackAction } from "@/actions/module-admin/uninstall-pack";
import { confirmAndUninstall } from "./confirm-uninstall";
import type { StatusTone } from "./module-admin-page";

export function InstalledPacksList({
  catalog,
  onStatus,
}: {
  catalog: CatalogEntry[];
  onStatus: (text: string, tone?: StatusTone) => void;
}) {
  const router = useRouter();

  if (catalog.length === 0) return null;

  async function handleUninstall(entry: CatalogEntry) {
    const result = await confirmAndUninstall(entry.packCode, entry.name, {
      confirm: (message) => window.confirm(message),
      uninstallPackAction,
    });
    if (result === null) return;
    if (!result.success) {
      onStatus(result.error, "error");
      return;
    }
    onStatus("Uninstalled.");
    router.refresh();
  }

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
          <dd className="flex items-center gap-2 text-[13px] text-[color:hsl(var(--muted-foreground))]">
            {entry.status === "not-licensed" ? entry.message : entry.status}
            {entry.status === "installed" && entry.packCode !== "core" && (
              <button
                type="button"
                onClick={() => void handleUninstall(entry)}
                className="text-[color:hsl(var(--destructive))] underline"
              >
                Uninstall
              </button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
