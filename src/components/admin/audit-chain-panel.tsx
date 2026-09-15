"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  exportChainAttestation,
  runAuditChainVerification,
} from "@/actions/admin/audit-chain";

interface AuditChainPanelProps {
  head: { entries: string; hash: string } | null;
  history: {
    id: string;
    verifiedAt: string;
    ok: boolean;
    firstBadSequence: string | null;
  }[];
}

const stateWord = "text-[11px] font-medium uppercase tracking-[0.06em]";

export function AuditChainPanel({ head, history }: AuditChainPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function verifyNow() {
    setStatus(null);
    startTransition(async () => {
      const result = await runAuditChainVerification();
      if (!result.success) {
        setStatus(result.error);
        return;
      }
      setStatus(
        result.data.ok
          ? "Verified. The chain is intact."
          : `Verified. The chain is broken at entry #${result.data.firstBadSequence}.`,
      );
      router.refresh();
    });
  }

  function exportAttestation() {
    setStatus(null);
    startTransition(async () => {
      const result = await exportChainAttestation();
      if (!result.success) {
        setStatus(result.error);
        return;
      }
      const bytes = Uint8Array.from(atob(result.data.base64), (c) =>
        c.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-6">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Entries</dt>
        <dd className="tabular-nums">{head?.entries ?? "0"}</dd>
        <dt className="text-muted-foreground">Head hash (SHA-256)</dt>
        <dd className="break-all tabular-nums">
          {head?.hash ?? "No audited changes yet"}
        </dd>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={verifyNow} disabled={isPending}>
          Verify whole chain now
        </Button>
        <Button
          variant="outline"
          onClick={exportAttestation}
          disabled={isPending}
        >
          Export attestation
        </Button>
        <p role="status" aria-live="polite" className="text-sm">
          {isPending ? "Working…" : status}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Verified (IST)</TableHead>
            <TableHead>Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.length === 0 ? (
            <TableRow>
              <TableCell colSpan={2} className="text-muted-foreground">
                No verification has run yet.
              </TableCell>
            </TableRow>
          ) : (
            history.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="tabular-nums">{h.verifiedAt}</TableCell>
                <TableCell>
                  {h.ok ? (
                    <span className={`${stateWord} text-success`}>Intact</span>
                  ) : (
                    <span className={`${stateWord} text-destructive`}>
                      Broken at entry #{h.firstBadSequence}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
