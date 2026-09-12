"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface BhSignatureCaptureProps {
  signerName: string;
  onSign: (comments: string) => void;
  disabled?: boolean;
  isPending?: boolean;
}

const DECLARATION_TEXT = `I, [SIGNER_NAME], hereby certify that I have reviewed the audit observations listed in this report. The information provided herein is true and correct to the best of my knowledge. I acknowledge the findings and commit to implementing the remedial actions as agreed.`;

export function BhSignatureCapture({
  signerName,
  onSign,
  disabled = false,
  isPending = false,
}: BhSignatureCaptureProps) {
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [comments, setComments] = useState("");

  const canSign =
    declarationAccepted && comments.trim().length > 0 && !disabled;

  const handleSign = () => {
    if (canSign) {
      onSign(comments);
    }
  };

  return (
    <Card className="space-y-6 p-6">
      <div>
        <h3 className="mb-4 text-lg font-semibold">Branch Head Declaration</h3>

        {/* Declaration Text */}
        <div className="bg-muted/50 mb-4 rounded-md border p-4">
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {DECLARATION_TEXT.replace("[SIGNER_NAME]", signerName)}
          </p>
        </div>

        {/* Declaration Checkbox */}
        <div className="mb-4 flex items-start space-x-3">
          <Checkbox
            id="declaration-acceptance"
            checked={declarationAccepted}
            onCheckedChange={(checked) =>
              setDeclarationAccepted(checked === true)
            }
            disabled={disabled || isPending}
          />
          <div className="space-y-1 leading-none">
            <Label
              htmlFor="declaration-acceptance"
              className="cursor-pointer text-sm font-medium"
            >
              I accept this declaration
            </Label>
            <p className="text-muted-foreground text-sm">
              You must accept the declaration to sign the certificate
            </p>
          </div>
        </div>

        {/* Comments Field */}
        <div className="space-y-2">
          <Label htmlFor="bh-comments">
            Acknowledgment Comments <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="bh-comments"
            placeholder="Enter your acknowledgment comments here..."
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            disabled={disabled || isPending}
            className="min-h-[100px]"
            maxLength={2000}
          />
          <p className="text-muted-foreground text-xs">
            {comments.length}/2000 characters
          </p>
        </div>

        {/* Warning if requirements not met */}
        {!declarationAccepted && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              Please accept the declaration and provide comments to sign the
              certificate.
            </p>
          </div>
        )}
      </div>

      {/* Sign Button */}
      <div className="flex justify-end">
        <Button onClick={handleSign} disabled={!canSign || isPending} size="lg">
          {isPending ? "Signing..." : "Sign Certificate"}
        </Button>
      </div>
    </Card>
  );
}
