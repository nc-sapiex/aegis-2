"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import type { CatalogEntry } from "@/data-access/pack-catalog";
import { InstalledPacksList } from "./installed-packs-list";
import { ModuleTable } from "./module-table";
import { AddStatementPanel } from "./add-statement-panel";

export type StatusTone = "ok" | "error";

export function ModuleAdminPage({
  modules,
  catalog,
}: {
  modules: ModuleAdminRow[];
  catalog: CatalogEntry[];
}) {
  // null = closed; "" = open with no module chosen yet (header action);
  // a real id = open pre-scoped to that module's row.
  const [panelModuleId, setPanelModuleId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{
    text: string;
    tone: StatusTone;
  } | null>(null);
  const statusTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = React.useCallback(
    (text: string, tone: StatusTone = "ok") => {
      setStatus({ text, tone });
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus(null), 2400);
    },
    [],
  );

  React.useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[27px]">Audit modules</h1>
          <p className="text-[13px] text-[color:hsl(var(--muted-foreground))]">
            What this bank examines, and who owns each statement.
          </p>
        </div>
        <div className="flex gap-3">
          {/* ponytail: install-pack action needs a file-upload flow the
              brief for this task never wires (installPackAction takes a
              server filePath, not an uploaded File) — left inert here;
              see task-7-report.md concerns. */}
          <button
            type="button"
            disabled
            title="Not wired in this task — see report"
            className="rounded-[2px] border border-[color:hsl(var(--border-strong))] px-3 py-1.5 text-[13px] text-[color:hsl(var(--foreground))] disabled:opacity-40"
          >
            Install pack
          </button>
          <button
            type="button"
            onClick={() => setPanelModuleId("")}
            className="rounded-[2px] border border-[color:hsl(var(--primary))] px-3 py-1.5 text-[13px] text-[color:hsl(var(--primary))]"
          >
            Add bank statement
          </button>
        </div>
      </div>

      <InstalledPacksList catalog={catalog} onStatus={showStatus} />

      <ModuleTable
        modules={modules}
        onAddStatement={(moduleId) => setPanelModuleId(moduleId)}
        onStatus={showStatus}
      />

      <p className="border-t border-[color:hsl(var(--border))] pt-2 text-[13px] text-[color:hsl(var(--muted-foreground))]">
        <b className="text-[color:hsl(var(--foreground))]">
          Every content change here
        </b>{" "}
        — a bank statement, a pack weight, a pack module&apos;s On/Off — applies
        to engagements created from now on. An engagement already underway keeps
        the statement set it started with.
      </p>

      {panelModuleId !== null && (
        <AddStatementPanel
          modules={modules}
          initialModuleId={panelModuleId}
          onClose={() => setPanelModuleId(null)}
          onStatus={showStatus}
        />
      )}

      {status && (
        <div
          role="status"
          className={cn(
            "fixed bottom-4 left-4 z-50 rounded-[2px] border bg-[color:hsl(var(--background))] px-3 py-1.5 text-[13px]",
            status.tone === "error"
              ? "border-[color:hsl(var(--destructive))] text-[color:hsl(var(--destructive))]"
              : "border-[color:hsl(var(--border-strong))] text-[color:hsl(var(--foreground))]",
          )}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
