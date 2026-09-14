"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { formatScore } from "@/lib/format-score";

export type RailModule = {
  moduleId: string;
  code: string;
  name: string;
  group: "CORE" | "PACKS" | "KERNEL";
  scored: number;
  total: number;
  score: number | null; // null = "—", nothing scored yet
  current: boolean;
};

function bandColor(score: number | null) {
  if (score === null) return "text-[color:var(--muted-foreground)]";
  if (score >= 0.8) return "text-[color:var(--success)]";
  if (score >= 0.5) return "text-[color:var(--warning)]";
  return "text-[color:var(--destructive)]";
}

function RailList({
  modules,
  onSelect,
}: {
  modules: RailModule[];
  onSelect: (code: string) => void;
}) {
  const groups: RailModule["group"][] = ["CORE", "PACKS", "KERNEL"];
  return (
    <nav aria-label="Modules">
      {groups.map((group) => {
        const inGroup = modules.filter((m) => m.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group}>
            <div className="text-[11px] tracking-wide text-[color:var(--muted-foreground)] uppercase">
              {group}
            </div>
            {inGroup.map((m) => (
              <button
                key={m.moduleId}
                type="button"
                aria-current={m.current ? "true" : undefined}
                onClick={() => onSelect(m.code)}
                className="flex w-full justify-between border-l-2 py-1 text-left"
                style={{
                  borderColor: m.current ? "var(--primary)" : "transparent",
                }}
              >
                <span>
                  {m.name} {m.scored}/{m.total}
                </span>
                <span className={bandColor(m.score)}>
                  {m.score === null ? "—" : formatScore(m.score)}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export function ModuleRail({
  engagementId,
  modules,
  currentTitle,
  onSelect,
}: {
  engagementId: string;
  modules: RailModule[];
  currentTitle: string;
  onSelect?: (code: string) => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const handleSelect =
    onSelect ??
    ((code: string) =>
      router.push(`/audit-execution/${engagementId}/rbia/module/${code}`));

  if (!isMobile) return <RailList modules={modules} onSelect={handleSelect} />;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="flex items-center gap-1">
          {currentTitle} ▾
        </button>
      </SheetTrigger>
      <SheetContent side="left">
        <RailList modules={modules} onSelect={handleSelect} />
      </SheetContent>
    </Sheet>
  );
}
