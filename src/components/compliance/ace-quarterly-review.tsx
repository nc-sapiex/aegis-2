"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  reviewAceItem,
  processAceQuarterly,
} from "@/actions/compliance/ace-processing";

interface AceItem {
  id: string;
  daysOpen: number;
  escalationLevel: number;
  status: string;
  observation?: {
    id: string;
    title: string;
    severity: string;
  };
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  audit?: {
    id: string;
    auditNumber: string | null;
  };
}

interface AceQuarterlyReviewProps {
  items: AceItem[];
  currentQuarter: string;
}

export function AceQuarterlyReview({
  items,
  currentQuarter,
}: AceQuarterlyReviewProps) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<AceItem | null>(null);
  const [decision, setDecision] = useState<string>("");
  const [comments, setComments] = useState<string>("");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate stats
  const totalItems = items.length;
  const criticalCount = items.filter(
    (i) => i.observation?.severity === "CRITICAL",
  ).length;
  const highCount = items.filter(
    (i) => i.observation?.severity === "HIGH",
  ).length;
  const avgDaysOverdue =
    totalItems > 0
      ? Math.round(items.reduce((sum, i) => sum + i.daysOpen, 0) / totalItems)
      : 0;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      case "LOW":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleReviewClick = (item: AceItem) => {
    setSelectedItem(item);
    setDecision("");
    setComments("");
    setIsReviewDialogOpen(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedItem || !decision || !comments.trim()) {
      toast.error("Please select a decision and provide comments");
      return;
    }

    setIsProcessing(true);

    const result = await reviewAceItem({
      complianceItemId: selectedItem.id,
      decision: decision as any,
      comments,
      quarter: currentQuarter,
    });

    setIsProcessing(false);

    if (result.success) {
      toast.success(`ACE review completed: ${decision}`);
      setIsReviewDialogOpen(false);
      setSelectedItem(null);
      // Refresh page
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleProcessQuarter = async () => {
    setIsProcessing(true);

    const result = await processAceQuarterly({ quarter: currentQuarter });

    setIsProcessing(false);

    if (result.success) {
      toast.success(
        `Processed ${result.data.processed} items for quarter ${result.data.quarter}`,
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Critical Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {criticalCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              High Severity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {highCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Avg Days Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgDaysOverdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>Quarter:</Label>
          <Badge variant="outline" className="px-4 py-1 text-lg">
            {currentQuarter}
          </Badge>
        </div>
        <Button onClick={handleProcessQuarter} disabled={isProcessing}>
          Process Quarter
        </Button>
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>ACE Review Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Observation</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead className="text-right">Escalation Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.branch?.name ?? "N/A"}
                      <div className="text-muted-foreground text-xs">
                        {item.branch?.code}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md truncate">
                        {item.observation?.title ?? "N/A"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {item.audit?.auditNumber ?? "N/A"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getSeverityColor(
                          item.observation?.severity ?? "MEDIUM",
                        )}
                      >
                        {item.observation?.severity ?? "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {item.daysOpen}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">L{item.escalationLevel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReviewClick(item)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground h-24 text-center"
                    >
                      No items in ACE review queue
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Compliance Item</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Observation:</Label>
                <p className="mt-1 font-medium">
                  {selectedItem.observation?.title}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Branch:</Label>
                  <p className="mt-1 font-medium">
                    {selectedItem.branch?.name}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Days Overdue:</Label>
                  <p className="mt-1 font-medium">{selectedItem.daysOpen}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="decision">Decision *</Label>
                <Select value={decision} onValueChange={setDecision}>
                  <SelectTrigger id="decision" className="mt-1">
                    <SelectValue placeholder="Select decision" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FORWARD_TO_ACB">
                      Forward to ACB
                    </SelectItem>
                    <SelectItem value="MONITOR">Continue Monitoring</SelectItem>
                    <SelectItem value="CLOSE">Close Item</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="comments">Comments *</Label>
                <Textarea
                  id="comments"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Provide rationale for your decision..."
                  rows={4}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsReviewDialogOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button onClick={handleReviewSubmit} disabled={isProcessing}>
              {isProcessing ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
