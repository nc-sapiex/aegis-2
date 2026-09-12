"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, AlertTriangle } from "@/lib/icons";
import type {
  ImportSummary,
  RowValidationError,
} from "@/lib/loan-portfolio/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportSummaryProps {
  summary: ImportSummary;
  rejectedRows: { rowNumber: number; errors: RowValidationError[] }[];
  warnings: { rowNumber: number; message: string }[];
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays import results after the server action completes.
 *
 * Shows a summary of accepted/rejected/warnings, plus a collapsible
 * table of rejected rows with per-field error details.
 */
export function ImportSummaryView({
  summary,
  rejectedRows,
  warnings,
  onDismiss,
}: ImportSummaryProps) {
  const [rejectedOpen, setRejectedOpen] = useState(summary.rejected > 0);
  const [warningsOpen, setWarningsOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import Complete</CardTitle>
        <CardDescription>
          {summary.totalRows} row{summary.totalRows !== 1 ? "s" : ""} processed
          from the uploaded file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary badges */}
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="bg-green-100 px-3 py-1 text-sm text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100">
            {summary.accepted} accepted
          </Badge>
          {summary.rejected > 0 && (
            <Badge className="bg-red-100 px-3 py-1 text-sm text-red-800 hover:bg-red-100 dark:bg-red-900 dark:text-red-100">
              {summary.rejected} rejected
            </Badge>
          )}
          {summary.warnings > 0 && (
            <Badge className="bg-amber-100 px-3 py-1 text-sm text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100">
              {summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Rejected rows collapsible */}
        {rejectedRows.length > 0 && (
          <Collapsible open={rejectedOpen} onOpenChange={setRejectedOpen}>
            <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-md border px-4 py-3 text-sm font-medium transition-colors">
              <span className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Rejected Rows ({rejectedRows.length})
              </span>
              {rejectedOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row #</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rejectedRows.map((row) =>
                      row.errors.map((error, errIdx) => (
                        <TableRow key={`${row.rowNumber}-${errIdx}`}>
                          {errIdx === 0 && (
                            <TableCell
                              rowSpan={row.errors.length}
                              className="align-top font-mono text-sm font-medium"
                            >
                              {row.rowNumber}
                            </TableCell>
                          )}
                          <TableCell className="font-mono text-sm">
                            {error.field}
                          </TableCell>
                          <TableCell className="text-sm text-red-700 dark:text-red-400">
                            {error.message}
                          </TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Warnings collapsible */}
        {warnings.length > 0 && (
          <Collapsible open={warningsOpen} onOpenChange={setWarningsOpen}>
            <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center justify-between rounded-md border px-4 py-3 text-sm font-medium transition-colors">
              <span className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Warnings ({warnings.length})
              </span>
              {warningsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 space-y-1 rounded-md border p-3">
                {warnings.map((w, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-amber-700 dark:text-amber-400"
                  >
                    <span className="font-mono font-medium">
                      Row {w.rowNumber}:
                    </span>{" "}
                    {w.message}
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="flex justify-end">
          <Button onClick={onDismiss}>Done</Button>
        </div>
      </CardContent>
    </Card>
  );
}
