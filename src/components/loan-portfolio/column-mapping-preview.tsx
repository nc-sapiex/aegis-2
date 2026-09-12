"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle } from "@/lib/icons";
import type { ColumnMapping } from "@/lib/loan-portfolio/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColumnMappingPreviewProps {
  mappings: ColumnMapping[];
  onConfirm: () => void;
  onCancel: () => void;
}

// Mandatory canonical field names
const MANDATORY_FIELDS = [
  "accountNo",
  "borrowerName",
  "sanctionAmount",
  "outstandingAmount",
  "loanType",
];

// Human-readable field labels for error messages
const FIELD_LABELS: Record<string, string> = {
  accountNo: "Account No",
  borrowerName: "Borrower Name",
  sanctionAmount: "Sanction Amount",
  outstandingAmount: "Outstanding Amount",
  loanType: "Loan Type",
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Shows the detected column mapping before import confirmation.
 *
 * Renders a table of source header → canonical field with confidence badges.
 * Blocks confirmation if any mandatory field is missing from the mapping.
 */
export function ColumnMappingPreview({
  mappings,
  onConfirm,
  onCancel,
}: ColumnMappingPreviewProps) {
  // Determine which mandatory fields are covered (via exact or fuzzy match)
  const mappedFields = new Set(
    mappings
      .filter((m) => m.confidence !== "unmatched")
      .map((m) => m.targetField),
  );

  const missingFields = MANDATORY_FIELDS.filter((f) => !mappedFields.has(f));
  const hasMissingFields = missingFields.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Column Mapping Preview</CardTitle>
        <CardDescription>
          We detected the following column mappings. Confirm to proceed with
          import.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasMissingFields && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Missing required columns:{" "}
              <strong>
                {missingFields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
              </strong>
              . Please check your file headers.
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source Column</TableHead>
                <TableHead>Maps To</TableHead>
                <TableHead>Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((mapping, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-sm">
                    {mapping.sourceColumn}
                  </TableCell>
                  <TableCell className="text-sm">
                    {mapping.confidence === "unmatched"
                      ? "—"
                      : (FIELD_LABELS[mapping.targetField] ??
                        mapping.targetField)}
                  </TableCell>
                  <TableCell>
                    {mapping.confidence === "exact" && (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-100">
                        Exact Match
                      </Badge>
                    )}
                    {mapping.confidence === "fuzzy" && (
                      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100">
                        Fuzzy Match
                      </Badge>
                    )}
                    {mapping.confidence === "unmatched" && (
                      <Badge variant="secondary">Ignored</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={hasMissingFields}>
            Confirm & Import
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
