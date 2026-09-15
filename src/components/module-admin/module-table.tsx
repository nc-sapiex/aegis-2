"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import { computeModuleShares, simulateWeightChange } from "@/lib/module-shares";
import { formatScore } from "@/lib/format-score";
import { saveModuleWeights } from "@/actions/module-admin/save-module-weights";
import { toggleModule } from "@/actions/module-admin/toggle-module";
import { WeightInput } from "./weight-input";
import type { StatusTone } from "./module-admin-page";

const HEADER_CELL =
  "py-2 pr-3 text-left text-[12px] uppercase tracking-[0.06em] text-[color:hsl(var(--muted-foreground))]";

export function ModuleTable({
  modules,
  onAddStatement,
  onStatus,
}: {
  modules: ModuleAdminRow[];
  onAddStatement: (moduleId: string) => void;
  onStatus: (text: string, tone?: StatusTone) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [activeOverride, setActiveOverride] = React.useState<
    Record<string, boolean>
  >({});
  const [saving, setSaving] = React.useState(false);

  // Most recent engagement's per-module scores, for the live "would move
  // from X to Y" preview (spec §7.6). Not threaded through this task's DAL
  // read (getModuleAdminView returns admin rows, not score history) — see
  // task-7-report.md concerns. Left empty rather than wired to zero, so the
  // preview degrades to "Unsaved." instead of printing a fabricated 0.0→0.0.
  const lastScores: Record<string, number> = {};
  const hasScores = Object.keys(lastScores).length > 0;

  const grouped = {
    core: modules.filter((m) => m.group === "core"),
    pack: modules.filter((m) => m.group === "pack"),
  };

  function weightFor(m: ModuleAdminRow): number {
    return draft[m.code] ?? m.weight;
  }

  const hasDraft = Object.keys(draft).length > 0;

  const draftShareByCode = React.useMemo(() => {
    const shared = computeModuleShares(
      modules.map((m) => ({
        code: m.code,
        weight: weightFor(m),
        isActive: m.isActive,
      })),
    );
    return new Map(shared.map((s) => [s.code, s.share]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, draft]);

  function preview(m: ModuleAdminRow): { from: number; to: number } | null {
    if (!(m.code in draft) || draft[m.code] === m.weight || !hasScores) {
      return null;
    }
    return simulateWeightChange(
      modules.map((mm) => ({
        code: mm.code,
        weight: weightFor(mm),
        isActive: mm.isActive,
      })),
      m.code,
      draft[m.code],
      lastScores,
    );
  }

  async function handleToggle(m: ModuleAdminRow, next: boolean) {
    setActiveOverride((o) => ({ ...o, [m.id]: next }));
    const result = await toggleModule(m.id, next);
    if (!result.success) {
      setActiveOverride((o) => ({ ...o, [m.id]: m.isActive }));
      onStatus(result.error, "error");
      return;
    }
    setActiveOverride((o) => {
      const rest = { ...o };
      delete rest[m.id];
      return rest;
    });
    router.refresh();
  }

  async function save() {
    const changed = Object.entries(draft)
      .map(([code, weight]) => ({
        moduleId: modules.find((m) => m.code === code)?.id ?? "",
        weight,
      }))
      .filter((c) => c.moduleId);
    if (changed.length === 0) return;
    setSaving(true);
    const result = await saveModuleWeights(changed);
    setSaving(false);
    if (!result.success) {
      onStatus(result.error, "error");
      return;
    }
    setDraft({});
    onStatus("Saved.");
    router.refresh();
  }

  function renderGroup(label: string, rows: ModuleAdminRow[]) {
    if (rows.length === 0) return null;
    return (
      <React.Fragment key={label}>
        <tr>
          <th
            colSpan={7}
            className="border-b border-[color:hsl(var(--foreground))] pt-4 pb-1 text-left text-[12px] tracking-[0.06em] text-[color:hsl(var(--muted-foreground))] uppercase"
          >
            {label}
          </th>
        </tr>
        {rows.map((m) => {
          const p = preview(m);
          const changed = m.code in draft && draft[m.code] !== m.weight;
          const isActive = activeOverride[m.id] ?? m.isActive;
          const share = draftShareByCode.get(m.code) ?? m.share;
          const shareChanged = hasDraft && Math.abs(share - m.share) > 1e-6;

          return (
            <tr key={m.id} className="border-b border-[color:hsl(var(--border))]">
              <td className="py-2 pr-3">
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={m.isCore}
                  onChange={(e) => void handleToggle(m, e.target.checked)}
                  aria-label={`${m.name} on`}
                  className="accent-[color:hsl(var(--primary))]"
                />
              </td>
              <td className="py-2 pr-3 text-[13px]">
                {m.name}{" "}
                {m.packLabel && (
                  <span className="ml-1 rounded-[2px] border border-[color:hsl(var(--primary))] px-1.5 py-0.5 text-[11px] tracking-[0.06em] text-[color:hsl(var(--primary))] uppercase">
                    {m.packLabel}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-[13px] text-[color:hsl(var(--muted-foreground))]">
                {m.kind}
              </td>
              <td className="py-2 pr-3 text-[13px] text-[color:hsl(var(--muted-foreground))]">
                {m.applicabilityText}
              </td>
              <td
                className={cn(
                  "py-2 pr-3 text-[13px] font-medium tabular-nums",
                  shareChanged && "text-[color:hsl(var(--primary))]",
                )}
              >
                {formatScore(share)}%
              </td>
              <td className="py-2 pr-3">
                <WeightInput
                  value={weightFor(m)}
                  disabled={!isActive}
                  onChange={(v) => setDraft((d) => ({ ...d, [m.code]: v }))}
                />
                {changed && (
                  <div className="mt-1 text-[12.5px] text-[color:hsl(var(--muted-foreground))]">
                    Unsaved.
                    {p &&
                      ` Would move from ${formatScore(p.from)}% to ${formatScore(p.to)}%.`}
                  </div>
                )}
              </td>
              <td className="py-2 text-[13px]">
                {m.statementCount}
                {m.bankStatementCount > 0 &&
                  ` +${m.bankStatementCount} bank`}{" "}
                <button
                  type="button"
                  onClick={() => onAddStatement(m.id)}
                  className="text-[color:hsl(var(--primary))] underline"
                >
                  Statements
                </button>
              </td>
            </tr>
          );
        })}
      </React.Fragment>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:hsl(var(--foreground))]">
              <th className={HEADER_CELL}>On</th>
              <th className={HEADER_CELL}>Module</th>
              <th className={HEADER_CELL}>Kind</th>
              <th className={HEADER_CELL}>Applies to</th>
              <th className={HEADER_CELL}>Share of score</th>
              <th className={HEADER_CELL}>Weight</th>
              <th className={HEADER_CELL}>Statements</th>
            </tr>
          </thead>
          <tbody>
            {renderGroup("Core, bundled with AEGIS", grouped.core)}
            {renderGroup("Pack modules", grouped.pack)}
          </tbody>
        </table>
      </div>
      {hasDraft && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => setDraft({})}
            className="rounded-[2px] border border-[color:hsl(var(--border-strong))] px-3 py-1.5 text-[13px] disabled:opacity-50"
          >
            Discard
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-[2px] border border-[color:hsl(var(--primary))] px-3 py-1.5 text-[13px] text-[color:hsl(var(--primary))] disabled:opacity-50"
          >
            Save weights
          </button>
        </div>
      )}
    </div>
  );
}
