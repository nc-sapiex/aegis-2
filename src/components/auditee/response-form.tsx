"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "@/lib/icons";
import { submitAuditeeResponse } from "@/actions/auditee";

// ─── Types ──────────────────────────────────────────────────────────────────

const RESPONSE_TYPES = [
  {
    value: "CLARIFICATION",
    label: "Clarification",
    description:
      "Provide additional context or clarification on the observation",
  },
  {
    value: "COMPLIANCE_ACTION",
    label: "Compliance Action",
    description:
      "Describe corrective actions taken or planned to address the finding",
  },
  {
    value: "REQUEST_EXTENSION",
    label: "Request Extension",
    description: "Request additional time to address the observation",
  },
] as const;

type ResponseType = (typeof RESPONSE_TYPES)[number]["value"];

const ResponseFormSchema = z.object({
  responseType: z.enum(
    ["CLARIFICATION", "COMPLIANCE_ACTION", "REQUEST_EXTENSION"],
    {
      message: "Please select a response type",
    },
  ),
  content: z.string().min(10, "Response must be at least 10 characters"),
});

type ResponseFormValues = z.infer<typeof ResponseFormSchema>;

interface ResponseFormProps {
  observationId: string;
  observationStatus: string;
  onResponseSubmitted?: () => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ResponseForm({
  observationId,
  observationStatus,
  onResponseSubmitted,
}: ResponseFormProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<ResponseFormValues>({
    resolver: zodResolver(ResponseFormSchema),
    defaultValues: {
      responseType: "CLARIFICATION",
      content: "",
    },
  });

  const selectedType = form.watch("responseType");

  // Only allow responses on active observations
  const canRespond =
    observationStatus === "ISSUED" || observationStatus === "RESPONSE";

  if (!canRespond) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        Responses can only be submitted for observations in ISSUED or RESPONSE
        status.
      </div>
    );
  }

  const handleFormSubmit = () => {
    // Don't submit directly — show confirmation dialog first
    setShowConfirmDialog(true);
  };

  const handleConfirmedSubmit = () => {
    setShowConfirmDialog(false);
    const values = form.getValues();

    startTransition(async () => {
      const result = await submitAuditeeResponse({
        observationId,
        content: values.content,
        responseType: values.responseType,
      });

      if (result.success) {
        toast.success("Response submitted successfully");
        form.reset();
        onResponseSubmitted?.();
      } else {
        toast.error(result.error ?? "Failed to submit response");
      }
    });
  };

  return (
    <>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-5"
      >
        {/* Response Type Selector */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Response Type</Label>
          <RadioGroup
            value={selectedType}
            onValueChange={(value) =>
              form.setValue("responseType", value as ResponseType, {
                shouldValidate: true,
              })
            }
            className="space-y-2"
          >
            {RESPONSE_TYPES.map((type) => (
              <label
                key={type.value}
                className="hover:bg-muted/50 has-[button[data-state=checked]]:border-primary has-[button[data-state=checked]]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
              >
                <RadioGroupItem value={type.value} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{type.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {type.description}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
          {form.formState.errors.responseType && (
            <p className="text-xs text-red-600">
              {form.formState.errors.responseType.message}
            </p>
          )}
        </div>

        {/* Response Content */}
        <div className="space-y-2">
          <Label htmlFor="response-content" className="text-sm font-medium">
            {selectedType === "COMPLIANCE_ACTION"
              ? "Action Plan & Response"
              : "Response"}
          </Label>
          <Textarea
            id="response-content"
            placeholder={
              selectedType === "CLARIFICATION"
                ? "Provide additional context or clarification..."
                : selectedType === "COMPLIANCE_ACTION"
                  ? "Describe the corrective actions taken or planned..."
                  : "Explain why an extension is needed and the proposed timeline..."
            }
            rows={5}
            {...form.register("content")}
          />
          {form.formState.errors.content && (
            <p className="text-xs text-red-600">
              {form.formState.errors.content.message}
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Minimum 10 characters required.
          </p>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Response
        </Button>
      </form>

      {/* Immutability Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Response</AlertDialogTitle>
            <AlertDialogDescription>
              Responses cannot be edited or deleted after submission. Please
              review your response carefully before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-muted/30 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {RESPONSE_TYPES.find((t) => t.value === selectedType)?.label}
            </p>
            <p className="text-muted-foreground mt-1 line-clamp-3">
              {form.getValues("content")}
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmedSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Submit Response
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
