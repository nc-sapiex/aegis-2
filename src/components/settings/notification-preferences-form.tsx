"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updatePreferences } from "@/actions/notification-preferences";
import { Bell, Mail, Info } from "@/lib/icons";

interface NotificationPreferencesFormProps {
  initialPreferences: {
    emailEnabled: boolean;
    digestPreference: string;
  };
  isRegulatoryRole: boolean;
}

const DIGEST_OPTIONS = [
  {
    value: "immediate",
    label: "Immediate",
    description: "Send each notification as it happens",
  },
  {
    value: "daily",
    label: "Daily Digest",
    description: "One summary email per day",
  },
  {
    value: "weekly",
    label: "Weekly Digest",
    description: "One summary email per week",
  },
  { value: "none", label: "None", description: "No digest emails" },
] as const;

export function NotificationPreferencesForm({
  initialPreferences,
  isRegulatoryRole,
}: NotificationPreferencesFormProps) {
  const [emailEnabled, setEmailEnabled] = useState(
    initialPreferences.emailEnabled,
  );
  const [digestPreference, setDigestPreference] = useState(
    initialPreferences.digestPreference,
  );
  const [isPending, startTransition] = useTransition();

  const hasChanges =
    emailEnabled !== initialPreferences.emailEnabled ||
    digestPreference !== initialPreferences.digestPreference;

  function handleSave() {
    startTransition(async () => {
      const result = await updatePreferences({
        emailEnabled,
        digestPreference: digestPreference as
          | "immediate"
          | "daily"
          | "weekly"
          | "none",
      });

      if (result.success) {
        toast.success("Notification preferences updated.");
      } else {
        toast.error(result.error ?? "Failed to save preferences.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            Email Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="email-toggle" className="text-sm font-medium">
                Enable email notifications
              </Label>
              <p className="text-muted-foreground text-xs">
                Receive email alerts for observation assignments, responses, and
                reminders.
              </p>
            </div>
            <Switch
              id="email-toggle"
              checked={emailEnabled}
              onCheckedChange={setEmailEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Digest Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notification Delivery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="digest-select" className="text-sm font-medium">
              Delivery preference
            </Label>
            <p className="text-muted-foreground mb-2 text-xs">
              Choose how frequently you receive notification emails.
            </p>
            <Select
              value={digestPreference}
              onValueChange={setDigestPreference}
            >
              <SelectTrigger id="digest-select" className="w-full sm:w-64">
                <SelectValue placeholder="Select preference" />
              </SelectTrigger>
              <SelectContent>
                {DIGEST_OPTIONS.filter(
                  (opt) => !(isRegulatoryRole && opt.value === "none"),
                ).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Regulatory notice for CAE/CCO */}
          {isRegulatoryRole && (
            <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <div className="text-xs text-blue-800">
                <p className="font-medium">Weekly Audit Digest</p>
                <p>
                  As a CAE/CCO, you will always receive the weekly audit digest.
                  This is required for regulatory compliance and cannot be
                  disabled.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={!hasChanges || isPending}>
          {isPending ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}
