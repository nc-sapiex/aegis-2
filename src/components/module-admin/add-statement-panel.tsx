"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ModuleAdminRow } from "@/data-access/module-admin";
import { addBankStatement } from "@/actions/module-admin/add-bank-statement";
import type { StatusTone } from "./module-admin-page";

const FIELD_LABEL = "mt-3 block text-[13px]";
const FIELD_INPUT =
  "mt-1 block w-full rounded-[2px] border border-[color:hsl(var(--border-strong))] px-2 py-1.5 text-[13px]";

export function AddStatementPanel({
  modules,
  initialModuleId,
  onClose,
  onStatus,
}: {
  modules: ModuleAdminRow[];
  initialModuleId: string;
  onClose: () => void;
  onStatus: (text: string, tone?: StatusTone) => void;
}) {
  const router = useRouter();
  const [moduleId, setModuleId] = React.useState(initialModuleId);
  const [text, setText] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [weight, setWeight] = React.useState(1.0);
  const [isCritical, setIsCritical] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const previouslyFocused = React.useRef<Element | null>(null);

  React.useEffect(() => {
    previouslyFocused.current = document.activeElement;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [onClose]);

  const selectedModule = modules.find((m) => m.id === moduleId);

  async function save() {
    if (!selectedModule || !text.trim()) return;
    setSaving(true);
    const result = await addBankStatement({
      moduleId: selectedModule.id,
      sectionCode: selectedModule.code,
      text,
      reference: reference.trim() || undefined,
      weight,
      isCritical,
    });
    setSaving(false);
    if (!result.success) {
      onStatus(result.error, "error");
      return;
    }
    onStatus(`Added ${result.data.code}.`);
    router.refresh();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add bank statement"
      className="fixed top-0 right-0 bottom-0 z-40 w-[440px] overflow-y-auto border-l-2 border-[color:hsl(var(--foreground))] bg-[color:hsl(var(--background))] p-4"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="text-[13px] text-[color:hsl(var(--primary))] underline"
      >
        Close
      </button>
      <h2 className="mt-2 text-[17px]">Add bank statement</h2>

      <label className={FIELD_LABEL}>
        Module
        <select
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          className={FIELD_INPUT}
        >
          <option value="" disabled>
            Choose a module
          </option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className={FIELD_LABEL}>
        Statement text
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={`${FIELD_INPUT} min-h-24 text-[16px]`}
        />
      </label>

      <label className={FIELD_LABEL}>
        Reference (optional)
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className={FIELD_INPUT}
        />
      </label>

      <label className={FIELD_LABEL}>
        Weight
        <input
          type="number"
          min={0.5}
          max={3.0}
          step={0.5}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="mt-1 block w-24 rounded-[2px] border border-[color:hsl(var(--border-strong))] px-2 py-1.5 text-[13px] tabular-nums"
        />
      </label>

      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          checked={isCritical}
          onChange={(e) => setIsCritical(e.target.checked)}
        />
        Critical
      </label>

      <p className="mt-4 border-t border-[color:hsl(var(--border))] pt-2 text-[12.5px] text-[color:hsl(var(--muted-foreground))]">
        Scale: Fully compliant · Largely compliant · Partially compliant ·
        Marginally compliant · Non-compliant.
      </p>

      <button
        type="button"
        disabled={saving || !selectedModule || !text.trim()}
        onClick={() => void save()}
        className="mt-4 rounded-[2px] border border-[color:hsl(var(--primary))] px-3 py-1.5 text-[13px] text-[color:hsl(var(--primary))] disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}
