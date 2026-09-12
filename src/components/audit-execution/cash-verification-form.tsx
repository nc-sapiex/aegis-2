"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import {
  SaveCashVerificationSchema,
  type SaveCashVerificationInput,
} from "@/actions/audit-execution/schemas";
import { saveCashVerification } from "@/actions/audit-execution/cash-verification";
import { DenominationTable } from "./denomination-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface CashVerificationFormProps {
  engagementId: string;
  branchName: string;
  existingData: {
    cashInHand: number;
    bookBalance: number;
    difference: number;
    retentionLimit: number | null;
    denominationData: Record<string, number> | null;
    atmBalances: Record<string, number> | null;
    remarks: string | null;
  } | null;
}

interface AtmEntry {
  id: string;
  name: string;
  balance: number;
}

export function CashVerificationForm({
  engagementId,
  branchName,
  existingData,
}: CashVerificationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRetentionWarning, setShowRetentionWarning] = useState(false);
  const [denominationData, setDenominationData] = useState<
    Record<string, number>
  >(existingData?.denominationData || {});
  const [atmEntries, setAtmEntries] = useState<AtmEntry[]>(() => {
    if (existingData?.atmBalances) {
      return Object.entries(existingData.atmBalances).map(
        ([name, balance], idx) => ({
          id: `${idx}`,
          name,
          balance,
        }),
      );
    }
    return [];
  });

  const form = useForm<SaveCashVerificationInput>({
    resolver: zodResolver(SaveCashVerificationSchema),
    defaultValues: {
      engagementId,
      cashInHand: existingData?.cashInHand || 0,
      bookBalance: existingData?.bookBalance || 0,
      retentionLimit: existingData?.retentionLimit || undefined,
      denominationData: existingData?.denominationData || undefined,
      atmBalances: existingData?.atmBalances || undefined,
      remarks: existingData?.remarks || "",
    },
  });

  // Auto-compute cash in hand from denomination data
  useEffect(() => {
    const total = Object.entries(denominationData).reduce(
      (sum, [denom, count]) => {
        return sum + parseInt(denom) * count;
      },
      0,
    );
    form.setValue("cashInHand", total);
  }, [denominationData, form]);

  // Compute difference
  const cashInHand = form.watch("cashInHand");
  const bookBalance = form.watch("bookBalance");
  const retentionLimit = form.watch("retentionLimit");
  const difference = cashInHand - bookBalance;

  // Check retention limit
  useEffect(() => {
    if (retentionLimit && cashInHand > retentionLimit) {
      setShowRetentionWarning(true);
    } else {
      setShowRetentionWarning(false);
    }
  }, [cashInHand, retentionLimit]);

  const handleAddAtm = () => {
    setAtmEntries([
      ...atmEntries,
      { id: Date.now().toString(), name: "", balance: 0 },
    ]);
  };

  const handleRemoveAtm = (id: string) => {
    setAtmEntries(atmEntries.filter((entry) => entry.id !== id));
  };

  const handleAtmChange = (
    id: string,
    field: "name" | "balance",
    value: string | number,
  ) => {
    setAtmEntries(
      atmEntries.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const onSubmit = async (data: SaveCashVerificationInput) => {
    setIsSubmitting(true);

    // Convert ATM entries to record
    const atmBalances = atmEntries.reduce(
      (acc, entry) => {
        if (entry.name && entry.balance > 0) {
          acc[entry.name] = entry.balance;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const payload: SaveCashVerificationInput = {
      ...data,
      denominationData,
      atmBalances:
        Object.keys(atmBalances).length > 0 ? atmBalances : undefined,
    };

    const result = await saveCashVerification(payload);

    if (result.success) {
      toast.success("Cash verification saved successfully");
      if (result.data.retentionExceeded) {
        toast.warning("⚠️ Cash in hand exceeds retention limit", {
          duration: 5000,
        });
      }
    } else {
      toast.error(result.error);
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Cash Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Summary</CardTitle>
          <CardDescription>Cash position for {branchName}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cashInHand">Cash in Hand (₹)</Label>
              <Input
                id="cashInHand"
                type="number"
                step="0.01"
                {...form.register("cashInHand", { valueAsNumber: true })}
                className="font-mono"
                readOnly
              />
              <p className="text-muted-foreground text-xs">
                Auto-computed from denomination breakdown
              </p>
              {form.formState.errors.cashInHand && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.cashInHand.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bookBalance">Book Balance (₹)</Label>
              <Input
                id="bookBalance"
                type="number"
                step="0.01"
                {...form.register("bookBalance", { valueAsNumber: true })}
                className="font-mono"
                placeholder="0.00"
              />
              {form.formState.errors.bookBalance && (
                <p className="text-destructive text-sm">
                  {form.formState.errors.bookBalance.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="difference">Difference (₹)</Label>
              <Input
                id="difference"
                type="text"
                value={difference.toFixed(2)}
                readOnly
                className={`font-mono ${
                  difference > 0
                    ? "text-green-600"
                    : difference < 0
                      ? "text-red-600"
                      : ""
                }`}
              />
              <p className="text-muted-foreground text-xs">
                Auto-computed: Cash in Hand - Book Balance
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Denomination Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Denomination Breakdown</CardTitle>
          <CardDescription>Count of each currency denomination</CardDescription>
        </CardHeader>
        <CardContent>
          <DenominationTable
            value={denominationData}
            onChange={setDenominationData}
            disabled={isSubmitting}
          />
        </CardContent>
      </Card>

      {/* ATM Balances */}
      <Card>
        <CardHeader>
          <CardTitle>ATM Balances</CardTitle>
          <CardDescription>Cash balances in ATMs (optional)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {atmEntries.map((entry) => (
            <div key={entry.id} className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`atm-name-${entry.id}`}>ATM Name/ID</Label>
                <Input
                  id={`atm-name-${entry.id}`}
                  type="text"
                  value={entry.name}
                  onChange={(e) =>
                    handleAtmChange(entry.id, "name", e.target.value)
                  }
                  placeholder="e.g., ATM-01"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`atm-balance-${entry.id}`}>Balance (₹)</Label>
                <Input
                  id={`atm-balance-${entry.id}`}
                  type="number"
                  step="0.01"
                  value={entry.balance || ""}
                  onChange={(e) =>
                    handleAtmChange(
                      entry.id,
                      "balance",
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  placeholder="0.00"
                  className="font-mono"
                  disabled={isSubmitting}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleRemoveAtm(entry.id)}
                disabled={isSubmitting}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={handleAddAtm}
            disabled={isSubmitting}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add ATM
          </Button>
        </CardContent>
      </Card>

      {/* Retention Limit */}
      <Card>
        <CardHeader>
          <CardTitle>Retention Limit</CardTitle>
          <CardDescription>
            Maximum cash allowed to be retained at branch (optional)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="retentionLimit">Retention Limit (₹)</Label>
            <Input
              id="retentionLimit"
              type="number"
              step="0.01"
              {...form.register("retentionLimit", { valueAsNumber: true })}
              className="font-mono"
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {form.formState.errors.retentionLimit && (
              <p className="text-destructive text-sm">
                {form.formState.errors.retentionLimit.message}
              </p>
            )}
          </div>

          {showRetentionWarning && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Retention Limit Exceeded</AlertTitle>
              <AlertDescription>
                Cash in hand (₹{cashInHand.toLocaleString("en-IN")}) exceeds the
                retention limit (₹{retentionLimit?.toLocaleString("en-IN")}).
                Please verify and document the reason for excess cash.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Remarks */}
      <Card>
        <CardHeader>
          <CardTitle>Remarks</CardTitle>
          <CardDescription>
            Additional notes or observations (optional)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            {...form.register("remarks")}
            placeholder="Enter any relevant remarks..."
            rows={4}
            disabled={isSubmitting}
            maxLength={2000}
          />
          {form.formState.errors.remarks && (
            <p className="text-destructive text-sm">
              {form.formState.errors.remarks.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSubmitting || form.formState.isSubmitting}
        >
          {isSubmitting ? "Saving..." : "Save Cash Verification"}
        </Button>
      </div>
    </form>
  );
}
