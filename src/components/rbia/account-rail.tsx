"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SampledAccount = {
  recordId: string;
  recordKey: string;
  displayName: string;
  amount: string;
  classification: string;
  state: "Untouched" | "In progress" | "Complete";
  violationCount: number;
  current: boolean;
};

export function AccountRail({
  accounts,
  onSelect,
}: {
  accounts: SampledAccount[];
  onSelect?: (recordId: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (recordId: string) => {
      if (onSelect) {
        onSelect(recordId);
        return;
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("accountId", recordId);
      router.push(`${pathname}?${params.toString()}`);
    },
    [onSelect, pathname, router, searchParams],
  );

  return (
    <nav aria-label="Sampled accounts" className="space-y-2">
      <div className="text-[11px] tracking-wide text-[color:var(--muted-foreground)] uppercase">
        Sample · {accounts.length} accounts
      </div>
      <div className="space-y-1">
        {accounts.map((a) => (
          <button
            key={a.recordId}
            type="button"
            aria-current={a.current ? "true" : undefined}
            onClick={() => handleSelect(a.recordId)}
            className="flex w-full justify-between border-l-2 py-1 pl-2 text-left text-sm"
            style={{
              borderColor: a.current ? "var(--primary)" : "transparent",
            }}
          >
            <span>
              {a.recordKey} · {a.displayName} · {a.amount} · {a.classification}
            </span>
            <span>
              {a.state}
              {a.violationCount > 0 ? ` · ${a.violationCount}` : ""}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
