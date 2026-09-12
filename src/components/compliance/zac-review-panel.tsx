"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zacReviewCompliance } from "@/actions/compliance/zac-review";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from "@/lib/icons";
import { toast } from "sonner";

interface ZacReviewPanelProps {
  complianceItemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ZacReviewPanel({
  complianceItemId,
  open,
  onOpenChange,
}: ZacReviewPanelProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [decision, setDecision] = React.useState<
    "APPROVED" | "REJECTED" | "REQUEST_INFO"
  >("APPROVED");
  const [comments, setComments] = React.useState("");

  const handleSubmit = async () => {
    if (!comments.trim()) {
      toast.error("Please provide review comments");
      return;
    }

    setIsSubmitting(true);
    const result = await zacReviewCompliance({
      complianceItemId,
      decision,
      comments,
    });
    setIsSubmitting(false);

    if (result.success) {
      toast.success(
        `Review ${decision.toLowerCase()} - compliance item updated`,
      );
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ZAC Review</DialogTitle>
          <DialogDescription>
            Review the branch response and provide your decision as a Zonal
            Audit Committee member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="decision">Decision</Label>
            <Select
              value={decision}
              onValueChange={(val: any) => setDecision(val)}
            >
              <SelectTrigger id="decision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Approve - Accept Response</span>
                  </div>
                </SelectItem>
                <SelectItem value="REJECTED">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <span>Reject - Inadequate Response</span>
                  </div>
                </SelectItem>
                <SelectItem value="REQUEST_INFO">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <span>Request More Information</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">Review Comments</Label>
            <Textarea
              id="comments"
              placeholder="Provide detailed feedback on the branch response..."
              rows={6}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {decision === "REQUEST_INFO" && (
            <p className="rounded bg-yellow-50 p-3 text-sm text-yellow-600">
              This will send the item back to the branch for additional
              information.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
