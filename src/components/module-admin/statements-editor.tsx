"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { editStatement } from "@/actions/module-admin/edit-statement";
import { reorderStatement } from "@/actions/module-admin/reorder-statement";
import type { ContentOrigin } from "@/generated/prisma/enums";

type StatementRow = {
  id: string;
  code: string;
  description: string | null;
  weight: number;
  isCritical: boolean;
  isActive: boolean;
  origin: ContentOrigin;
};

const HEADER_CELL =
  "py-2 pr-3 text-left text-[12px] uppercase tracking-[0.06em] text-[color:hsl(var(--muted-foreground))]";

export function StatementsEditor({
  moduleName,
  nodes,
}: {
  moduleName: string;
  nodes: StatementRow[];
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<{
    text: string;
    tone: "ok" | "error";
  } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = React.useCallback(
    (text: string, tone: "ok" | "error" = "ok") => {
      setStatus({ text, tone });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus(null), 2400);
    },
    [],
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function runEdit(
    nodeId: string,
    patch: Parameters<typeof editStatement>[1],
  ) {
    const result = await editStatement(nodeId, patch);
    if (!result.success) {
      showStatus(result.error, "error");
      return;
    }
    showStatus("Saved.");
    router.refresh();
  }

  async function runReorder(nodeId: string, direction: "up" | "down") {
    const result = await reorderStatement(nodeId, direction);
    if (!result.success) {
      showStatus(result.error, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[27px]">{moduleName} — statements</h1>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[color:hsl(var(--foreground))]">
              <th className={HEADER_CELL}>Code</th>
              <th className={HEADER_CELL}>Statement</th>
              <th className={HEADER_CELL}>Weight</th>
              <th className={HEADER_CELL}>Critical</th>
              <th className={HEADER_CELL}>Origin</th>
              <th className={HEADER_CELL}>On</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-b border-[color:hsl(var(--border))]">
                <td className="py-2 pr-3 text-[13px] tabular-nums">{n.code}</td>
                <td className="py-2 pr-3 text-[14px]">
                  {n.origin === "BANK" ? (
                    <textarea
                      defaultValue={n.description ?? ""}
                      onBlur={(e) =>
                        void runEdit(n.id, { text: e.target.value })
                      }
                      className="block min-h-16 w-full rounded-[2px] border border-[color:hsl(var(--border-strong))] px-2 py-1"
                    />
                  ) : (
                    n.description
                  )}
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    min={0.5}
                    max={3.0}
                    step={0.5}
                    defaultValue={n.weight}
                    onBlur={(e) =>
                      void runEdit(n.id, { weight: Number(e.target.value) })
                    }
                    aria-label="Weight"
                    className="w-20 rounded-[2px] border border-[color:hsl(var(--border-strong))] px-1.5 py-1 text-[13px] tabular-nums"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="checkbox"
                    defaultChecked={n.isCritical}
                    onChange={(e) =>
                      void runEdit(n.id, { isCritical: e.target.checked })
                    }
                    aria-label="Critical"
                  />
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={cn(
                      "rounded-[2px] border px-1.5 py-0.5 text-[11px] tracking-[0.06em] uppercase",
                      n.origin === "BANK"
                        ? "border-[color:hsl(var(--primary))] text-[color:hsl(var(--primary))]"
                        : "border-[color:hsl(var(--border-strong))] text-[color:hsl(var(--muted-foreground))]",
                    )}
                  >
                    {n.origin === "PACK" ? "Pack" : "Bank"}
                  </span>
                </td>
                <td className="py-2 text-[13px]">
                  {n.isActive ? (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => void runReorder(n.id, "up")}
                        className="text-[color:hsl(var(--primary))] underline"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        onClick={() => void runReorder(n.id, "down")}
                        className="text-[color:hsl(var(--primary))] underline"
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        onClick={() => void runEdit(n.id, { isActive: false })}
                        className="text-[color:hsl(var(--destructive))] underline"
                      >
                        Turn off
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] tracking-[0.06em] text-[color:hsl(var(--muted-foreground))] uppercase">
                      Off
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
