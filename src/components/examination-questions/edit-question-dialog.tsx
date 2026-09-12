"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "@/lib/icons";
import { updateQuestion } from "@/actions/examination-questions/manage-questions";
import { UpdateQuestionSchema } from "@/actions/examination-questions/schemas";

// ─── Form schema ───────────────────────────────────────────────────────────────

// Client-side form has required text for the edit form (field required in update)
const EditFormSchema = z.object({
  text: z
    .string()
    .min(10, "Question text must be at least 10 characters")
    .max(1000, "Question text must be 1000 characters or fewer"),
  rbiReference: z
    .string()
    .max(500, "RBI reference must be 500 characters or fewer")
    .optional()
    .nullable(),
  bestPracticeTip: z
    .string()
    .max(1000, "Best practice tip must be 1000 characters or fewer")
    .optional()
    .nullable(),
  category: z
    .string()
    .max(100, "Category must be 100 characters or fewer")
    .optional()
    .nullable(),
  weight: z
    .number()
    .min(0.1, "Weight must be at least 0.1")
    .max(10, "Weight must be at most 10"),
  isCritical: z.boolean(),
});

type EditFormValues = z.infer<typeof EditFormSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface EditQuestionDialogProps {
  question: {
    id: string;
    text: string;
    rbiReference: string | null;
    bestPracticeTip: string | null;
    category: string | null;
    weight: number;
    isCritical: boolean;
  };
  engagementId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Dialog form for editing an existing examination question.
 *
 * Pre-fills all fields with the question's current values. Submits a partial
 * update — only the fields that were explicitly changed are sent to the server.
 *
 * Controlled open state — the trigger button is in the parent QuestionTable.
 *
 * Requirements: QMGT-03
 */
export function EditQuestionDialog({
  question,
  engagementId: _engagementId,
  open,
  onOpenChange,
}: EditQuestionDialogProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(EditFormSchema as any),
    defaultValues: {
      text: question.text,
      rbiReference: question.rbiReference ?? "",
      bestPracticeTip: question.bestPracticeTip ?? "",
      category: question.category ?? "",
      weight: question.weight,
      isCritical: question.isCritical,
    },
  });

  function onSubmit(values: EditFormValues) {
    startTransition(async () => {
      const result = await updateQuestion({
        questionId: question.id,
        text: values.text,
        rbiReference: values.rbiReference || null,
        bestPracticeTip: values.bestPracticeTip || null,
        category: values.category || null,
        weight: values.weight,
        isCritical: values.isCritical,
      });

      if (result.success) {
        toast.success("Question updated successfully");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to update question");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Examination Question</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Question Text */}
            <FormField
              control={form.control}
              name="text"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Question Text <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the examination question..."
                      className="min-h-[80px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* RBI Reference */}
            <FormField
              control={form.control}
              name="rbiReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>RBI Reference</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Master Direction on Housing Finance, Section 5.3"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Best Practice Tip */}
            <FormField
              control={form.control}
              name="bestPracticeTip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Best Practice Tip</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Practical guidance for auditors..."
                      className="min-h-[60px] resize-none"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Documentation, Collateral, NPA Norms"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Weight + isCritical in a row */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="10"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isCritical"
                render={({ field }) => (
                  <FormItem className="flex flex-col justify-end pb-1">
                    <FormLabel className="text-sm">Critical Item</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <span className="text-muted-foreground text-xs">
                        Violation caps module score
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
