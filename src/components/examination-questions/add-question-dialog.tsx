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
  DialogTrigger,
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
import { Plus, Loader2 } from "@/lib/icons";
import { addQuestion } from "@/actions/examination-questions/manage-questions";
import { AddQuestionSchema } from "@/actions/examination-questions/schemas";

// ─── Form schema (mirror of server schema for client validation) ──────────────

type AddQuestionFormValues = z.infer<typeof AddQuestionSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddQuestionDialogProps {
  moduleCode: string;
  engagementId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Dialog form for adding a new examination question to a credit module.
 *
 * Fields: question text (required), RBI reference (optional), best practice tip
 * (optional), category (optional), weight (default 1.0), isCritical checkbox.
 *
 * Module code is pre-set from the active module tab.
 *
 * Requirements: QMGT-02
 */
export function AddQuestionDialog({
  moduleCode,
  engagementId,
}: AddQuestionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<AddQuestionFormValues>({
    resolver: zodResolver(AddQuestionSchema as any),
    defaultValues: {
      moduleCode,
      text: "",
      rbiReference: "",
      bestPracticeTip: "",
      category: "",
      weight: 1.0,
      isCritical: false,
    },
  });

  function onSubmit(values: AddQuestionFormValues) {
    startTransition(async () => {
      const result = await addQuestion({
        ...values,
        moduleCode,
        rbiReference: values.rbiReference || null,
        bestPracticeTip: values.bestPracticeTip || null,
        category: values.category || null,
      });

      if (result.success) {
        toast.success("Question added successfully");
        form.reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to add question");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Question
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Examination Question</DialogTitle>
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
                onClick={() => {
                  form.reset();
                  setOpen(false);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Question
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
