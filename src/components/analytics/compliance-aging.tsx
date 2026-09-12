"use client";

import * as React from "react";
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
import { Badge } from "@/components/ui/badge";
import { Clock } from "@/lib/icons";

interface ComplianceAgingProps {
  data: {
    total: number;
    buckets: Array<{
      label: string;
      count: number;
      items: Array<{
        id: string;
        status: string;
        daysOpen: number;
        escalationLevel: number;
        dueDate: Date | null;
        branch: { name: string; code: string } | null;
        observation: { title: string; severity: string } | null;
      }>;
    }>;
    byEscalation: {
      L0: number;
      L1: number;
      L2: number;
      L3: number;
      L4: number;
    };
  };
}

export function ComplianceAging({ data }: ComplianceAgingProps) {
  const [expandedBucket, setExpandedBucket] = React.useState<string | null>(
    null,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Clock className="text-primary h-5 w-5" />
          <CardTitle>Compliance Aging Analysis</CardTitle>
        </div>
        <CardDescription>
          Open compliance items grouped by age — {data.total} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Escalation summary */}
          <div className="flex flex-wrap gap-2 border-b pb-2">
            {Object.entries(data.byEscalation).map(([level, count]) => (
              <Badge key={level} variant="outline">
                {level}: {count}
              </Badge>
            ))}
          </div>

          {/* Aging buckets */}
          <div className="space-y-2">
            {data.buckets.map((bucket) => (
              <div key={bucket.label}>
                <button
                  onClick={() =>
                    setExpandedBucket(
                      expandedBucket === bucket.label ? null : bucket.label,
                    )
                  }
                  className="hover:bg-muted/50 flex w-full items-center justify-between rounded-md border p-3 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{bucket.label}</span>
                    <Badge variant="secondary">{bucket.count}</Badge>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {expandedBucket === bucket.label ? "▼" : "▶"}
                  </span>
                </button>

                {/* Expanded items */}
                {expandedBucket === bucket.label && bucket.items.length > 0 && (
                  <div className="mt-2 rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Branch</TableHead>
                          <TableHead>Observation</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Days Open</TableHead>
                          <TableHead>Escalation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bucket.items.slice(0, 10).map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.branch?.code ?? "—"}
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xs truncate">
                                {item.observation?.title ?? "—"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.observation?.severity ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell>{item.daysOpen}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                L{item.escalationLevel}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {bucket.items.length > 10 && (
                      <div className="text-muted-foreground border-t p-2 text-center text-sm">
                        + {bucket.items.length - 10} more items
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
