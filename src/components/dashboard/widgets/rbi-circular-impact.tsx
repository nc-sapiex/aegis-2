"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { FileText } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RbiCircular {
  id: string;
  circularNumber: string;
  title: string;
  issuedDate: string;
  linkedRequirementCount: number;
}

interface RbiCircularImpactProps {
  circulars: RbiCircular[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RbiCircularImpact({ circulars }: RbiCircularImpactProps) {
  if (circulars.length === 0) {
    return (
      <EmptyStateCard
        title="No Recent Circulars"
        message="RBI circular impact data will appear when circulars are linked to compliance requirements."
        icon={<FileText className="h-8 w-8" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          RBI Circular Impact
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Circular</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead className="text-right">Requirements</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {circulars.slice(0, 10).map((circ) => (
              <TableRow key={circ.id}>
                <TableCell className="font-mono text-xs font-medium">
                  {circ.circularNumber}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">
                  {circ.title}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(circ.issuedDate).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={
                      circ.linkedRequirementCount > 0 ? "default" : "secondary"
                    }
                  >
                    {circ.linkedRequirementCount}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
