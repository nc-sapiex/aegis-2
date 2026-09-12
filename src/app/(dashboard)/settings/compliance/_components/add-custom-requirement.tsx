"use client";

/**
 * Add Custom Requirement Component (CMPL-04)
 *
 * Form to add bank-specific compliance requirements beyond
 * the standard RBI checklist items.
 */

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, CheckCircle2 } from "@/lib/icons";
import { addCustomRequirement } from "@/actions/compliance-management";

const CATEGORIES = [
  "RBI Compliance",
  "Internal Policy",
  "Board Resolution",
  "Statutory Requirement",
  "Risk Management",
  "Operational",
  "Other",
];

const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const FREQUENCIES = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Semi-Annual",
  "Annual",
  "One-Time",
];

export function AddCustomRequirement() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);

  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Internal Policy");
  const [priority, setPriority] = useState("MEDIUM");
  const [frequency, setFrequency] = useState("Quarterly");

  const resetForm = () => {
    setTitle("");
    setRequirement("");
    setDescription("");
    setCategory("Internal Policy");
    setPriority("MEDIUM");
    setFrequency("Quarterly");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!requirement.trim()) return;

    startTransition(async () => {
      const result = await addCustomRequirement({
        requirement: requirement.trim(),
        category,
        priority,
        frequency,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
      });

      if (result.success) {
        setSuccess(true);
        resetForm();
        setTimeout(() => setSuccess(false), 3000);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add Custom Requirement
        </CardTitle>
        <CardDescription>
          Create bank-specific compliance requirements beyond the standard RBI
          checklist.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="req-title">Title (optional)</Label>
            <Input
              id="req-title"
              placeholder="Short title for this requirement"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-requirement">
              Requirement <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="req-requirement"
              placeholder="Describe the compliance requirement..."
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="req-description">Description (optional)</Label>
            <Textarea
              id="req-description"
              placeholder="Additional context, references, or guidance..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <Badge
                        variant="outline"
                        className={
                          p === "CRITICAL"
                            ? "border-red-200 text-red-700"
                            : p === "HIGH"
                              ? "border-orange-200 text-orange-700"
                              : p === "MEDIUM"
                                ? "border-yellow-200 text-yellow-700"
                                : "border-green-200 text-green-700"
                        }
                      >
                        {p}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Review Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending || !requirement.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Requirement
                </>
              )}
            </Button>
            {success && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                Added successfully
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
