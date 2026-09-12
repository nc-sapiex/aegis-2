"use client";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";

interface DenominationTableProps {
  value: Record<string, number>;
  onChange: (data: Record<string, number>) => void;
  disabled?: boolean;
}

const DENOMINATIONS = [
  { value: 2000, label: "₹2000" },
  { value: 500, label: "₹500" },
  { value: 200, label: "₹200" },
  { value: 100, label: "₹100" },
  { value: 50, label: "₹50" },
  { value: 20, label: "₹20" },
  { value: 10, label: "₹10" },
  { value: 5, label: "₹5" },
  { value: 2, label: "₹2" },
  { value: 1, label: "₹1" },
];

export function DenominationTable({
  value,
  onChange,
  disabled,
}: DenominationTableProps) {
  const handleCountChange = (denomination: number, count: string) => {
    const numCount = parseInt(count) || 0;
    onChange({
      ...value,
      [denomination]: numCount,
    });
  };

  const calculateTotal = () => {
    return DENOMINATIONS.reduce((total, denom) => {
      const count = value[denom.value] || 0;
      return total + denom.value * count;
    }, 0);
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Denomination</TableHead>
          <TableHead className="w-[150px]">Count</TableHead>
          <TableHead className="text-right">Amount (₹)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {DENOMINATIONS.map((denom) => {
          const count = value[denom.value] || 0;
          const amount = denom.value * count;
          return (
            <TableRow key={denom.value}>
              <TableCell className="font-medium">{denom.label}</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={count || ""}
                  onChange={(e) =>
                    handleCountChange(denom.value, e.target.value)
                  }
                  disabled={disabled}
                  className="w-full"
                  placeholder="0"
                />
              </TableCell>
              <TableCell className="text-right font-mono">
                {amount.toLocaleString("en-IN")}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2} className="font-bold">
            Total Cash
          </TableCell>
          <TableCell className="text-right font-mono font-bold">
            ₹{calculateTotal().toLocaleString("en-IN")}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
