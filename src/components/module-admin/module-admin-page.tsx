"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import type { CatalogEntry } from "@/data-access/pack-catalog";
import { uploadPackAction } from "@/actions/module-admin/upload-pack";
import { InstalledPacksList } from "./installed-packs-list";
import { ModuleTable } from "./module-table";
import { AddStatementPanel } from "./add-statement-panel";

export type StatusTone = "ok" | "error";

export function ModuleAdminPage({
  modules,
  catalog,
  lastScores,
}: {
  modules: ModuleAdminRow[];
  catalog: CatalogEntry[];
  lastScores: Record<string, number>;
}) {
  const router = useRouter();
  // null = closed; "" = open with no module chosen yet (header action);
  // a real id = open pre-scoped to that module's row.
  const [panelModuleId, setPanelModuleId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{
    text: string;
    tone: StatusTone;
  } | null>(null);
  const statusTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const packFileInput = React.useRef<HTMLInputElement>(null);
  const [uploadingPack, setUploadingPack] = React.useState(false);

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

  async function handlePackFile(file: File) {
    setUploadingPack(true);
    const formData = new FormData();
    formData.set("pack", file);
    const result = await uploadPackAction(formData);
    setUploadingPack(false);
    if (!result.success) {
      showStatus(result.error, "error");
      return;
    }
    showStatus("Pack installed.");
    router.refresh();
  }

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
          <input
            ref={packFileInput}
            type="file"
            accept=".aegispack"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handlePackFile(file);
            }}
          />
          <button
            type="button"
            disabled={uploadingPack}
            onClick={() => packFileInput.current?.click()}
            className="rounded-[2px] border border-[color:hsl(var(--border-strong))] px-3 py-1.5 text-[13px] text-[color:hsl(var(--foreground))] disabled:opacity-40"
          >
            {uploadingPack ? "Installing…" : "Install pack"}
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
        lastScores={lastScores}
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
