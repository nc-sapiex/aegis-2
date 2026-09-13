"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { exportChainAttestation } from "@/actions/admin/export-chain-attestation";
import { runAuditChainVerification } from "@/actions/admin/run-audit-chain-verification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ShieldCheck } from "@/lib/icons";

interface AuditChainPanelProps {
  head: { lastSequence: string; lastHash: string; updatedAt: string } | null;
  history: {
    id: string;
    verifiedAt: string;
    ok: boolean;
    firstBadSequence: string | null;
  }[];
}

export function AuditChainPanel({ head, history }: AuditChainPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleRunNow() {
    setError(null);

    startTransition(async () => {
      const result = await runAuditChainVerification();

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success("Audit chain verification completed.");
      router.refresh();
    });
  }

  function handleExport() {
    setError(null);

    startTransition(async () => {
      const result = await exportChainAttestation();

      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      const byteCharacters = atob(result.data.base64);
      const bytes = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        bytes[i] = byteCharacters.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.data.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Attestation exported.");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Audit Chain Controls
            </CardTitle>
            <CardDescription>
              Run a tenant verification on demand or export the current attestation PDF.
            </CardDescription>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleRunNow} disabled={isPending}>
              {isPending ? "Running…" : "Run verification now"}
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={isPending}>
              <Download className="mr-2 h-4 w-4" />
              Export attestation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          {head ? (
            <div className="text-muted-foreground text-sm">
              Chain length {head.lastSequence} · head {head.lastHash.slice(0, 16)}… · updated{" "}
              {new Date(head.updatedAt).toLocaleString("en-IN")}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm">
              No chain head has been recorded for this tenant yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent verifications</CardTitle>
          <CardDescription>Latest 30 verification runs for this tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No verifications recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Verified</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{new Date(item.verifiedAt).toLocaleString("en-IN")}</TableCell>
                    <TableCell>{item.ok ? "OK" : `Failed at #${item.firstBadSequence}`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
