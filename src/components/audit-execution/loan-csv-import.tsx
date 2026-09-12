"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importLoanReviewCsv } from "@/actions/audit-execution/import-loan-csv";

interface ParsedRow {
  accountNo: string;
  borrowerName: string;
  productType: string;
  sanctionAmount: number;
  outstandingAmount: number;
  assetClass: string;
  dpd: number;
  auditObservation?: string;
}

interface LoanCsvImportProps {
  engagementId: string;
}

export function LoanCsvImport({ engagementId }: LoanCsvImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      toast.error("Please select a CSV file");
      return;
    }

    setFile(selectedFile);

    // Parse CSV client-side
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCsv(text);
      setPreviewRows(parsed.slice(0, 10)); // Preview first 10 rows
    };
    reader.readAsText(selectedFile);
  };

  const parseCsv = (text: string): ParsedRow[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0]
      .toLowerCase()
      .split(",")
      .map((h) => h.trim());

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      if (values.length < headers.length) continue;

      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx];
      });

      // Map CSV columns to schema fields
      try {
        rows.push({
          accountNo:
            row.account_no || row.accountno || row["account number"] || "",
          borrowerName:
            row.borrower_name || row.borrowername || row.borrower || "",
          productType: row.product_type || row.producttype || row.product || "",
          sanctionAmount: parseFloat(
            row.sanction_amount || row.sanctionamount || "0",
          ),
          outstandingAmount: parseFloat(
            row.outstanding_amount || row.outstandingamount || "0",
          ),
          assetClass:
            row.asset_class ||
            row.assetclass ||
            row["asset class"] ||
            "STANDARD",
          dpd: parseInt(row.dpd || "0", 10),
          auditObservation:
            row.audit_observation || row.observation || undefined,
        });
      } catch (error) {
        console.error("Failed to parse row:", row, error);
      }
    }

    return rows;
  };

  const handleImport = async () => {
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    setIsImporting(true);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target?.result as string;
        const rows = parseCsv(text);

        if (rows.length === 0) {
          toast.error("No valid rows found in CSV");
          setIsImporting(false);
          return;
        }

        const result = await importLoanReviewCsv({
          engagementId,
          rows,
        });

        if (result.success) {
          toast.success(
            `Successfully imported ${result.data.imported} loan reviews`,
          );
          setFile(null);
          setPreviewRows([]);
        } else {
          toast.error(result.error);
        }

        setIsImporting(false);
      };

      reader.onerror = () => {
        toast.error("Failed to read file");
        setIsImporting(false);
      };

      reader.readAsText(file);
    } catch (error) {
      toast.error("Failed to import CSV");
      setIsImporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          CSV Import
        </CardTitle>
        <CardDescription>
          Import loan accounts from a CSV file. This will replace all existing
          loan reviews for this engagement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warning:</strong> CSV import will delete all existing loan
            reviews for this engagement and replace them with the imported data.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <div className="text-sm font-medium">Expected CSV Format:</div>
          <div className="bg-muted rounded-md p-3 font-mono text-xs">
            account_no,borrower_name,product_type,sanction_amount,outstanding_amount,asset_class,dpd
            <br />
            LA001,John Doe,Term Loan,1000000,850000,STANDARD,0
            <br />
            LA002,Jane Smith,Cash Credit,500000,520000,SMA1,45
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label htmlFor="csv-upload" className="cursor-pointer">
            <div className="border-input bg-background hover:bg-accent flex items-center gap-2 rounded-md border px-4 py-2">
              <Upload className="h-4 w-4" />
              <span className="text-sm">Choose CSV File</span>
            </div>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {file && (
            <span className="text-muted-foreground text-sm">
              {file.name} (
              {previewRows.length > 0
                ? `${previewRows.length}+ rows`
                : "0 rows"}
              )
            </span>
          )}
        </div>

        {previewRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Preview (first 10 rows):</div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account No</TableHead>
                    <TableHead>Borrower</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Sanction</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead>Asset Class</TableHead>
                    <TableHead className="text-right">DPD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {row.accountNo}
                      </TableCell>
                      <TableCell>{row.borrowerName}</TableCell>
                      <TableCell>{row.productType}</TableCell>
                      <TableCell className="text-right">
                        {row.sanctionAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.outstandingAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>{row.assetClass}</TableCell>
                      <TableCell className="text-right">{row.dpd}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={!file || isImporting}
          className="w-full"
        >
          {isImporting ? "Importing..." : "Import Loan Reviews"}
        </Button>
      </CardContent>
    </Card>
  );
}
