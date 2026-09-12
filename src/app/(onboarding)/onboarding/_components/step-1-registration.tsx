"use client";

/**
 * Step 1: Bank Registration
 *
 * Collects basic bank identity and registration details.
 * Features:
 * - Real-time validation for RBI License Number and PAN patterns
 * - State-based auto-fill for "Registered With" field
 * - Conditional scheduledDate field (only for Scheduled UCBs)
 * - Auto-saves to Zustand store (debounced 500ms)
 * - Tooltips on banking-specific fields
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useFormAutoSave } from "@/hooks/use-auto-save";
import {
  bankRegistrationSchema,
  type BankRegistrationFormData,
} from "@/lib/onboarding-validation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "@/lib/icons";
import { cn } from "@/lib/utils";

// ─── Constants ──────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Puducherry",
];

const STATE_TO_RCS: Record<string, string> = {
  "Andhra Pradesh": "Registrar of Co-operative Societies, Andhra Pradesh",
  "Arunachal Pradesh": "Registrar of Co-operative Societies, Arunachal Pradesh",
  Assam: "Registrar of Co-operative Societies, Assam",
  Bihar: "Registrar of Co-operative Societies, Bihar",
  Chhattisgarh: "Registrar of Co-operative Societies, Chhattisgarh",
  Goa: "Registrar of Co-operative Societies, Goa",
  Gujarat: "Registrar of Co-operative Societies, Gujarat",
  Haryana: "Registrar of Co-operative Societies, Haryana",
  "Himachal Pradesh": "Registrar of Co-operative Societies, Himachal Pradesh",
  Jharkhand: "Registrar of Co-operative Societies, Jharkhand",
  Karnataka: "Registrar of Co-operative Societies, Karnataka",
  Kerala: "Registrar of Co-operative Societies, Kerala",
  "Madhya Pradesh": "Registrar of Co-operative Societies, Madhya Pradesh",
  Maharashtra: "Registrar of Co-operative Societies, Maharashtra",
  Manipur: "Registrar of Co-operative Societies, Manipur",
  Meghalaya: "Registrar of Co-operative Societies, Meghalaya",
  Mizoram: "Registrar of Co-operative Societies, Mizoram",
  Nagaland: "Registrar of Co-operative Societies, Nagaland",
  Odisha: "Registrar of Co-operative Societies, Odisha",
  Punjab: "Registrar of Co-operative Societies, Punjab",
  Rajasthan: "Registrar of Co-operative Societies, Rajasthan",
  Sikkim: "Registrar of Co-operative Societies, Sikkim",
  "Tamil Nadu": "Registrar of Co-operative Societies, Tamil Nadu",
  Telangana: "Registrar of Co-operative Societies, Telangana",
  Tripura: "Registrar of Co-operative Societies, Tripura",
  "Uttar Pradesh": "Registrar of Co-operative Societies, Uttar Pradesh",
  Uttarakhand: "Registrar of Co-operative Societies, Uttarakhand",
  "West Bengal": "Registrar of Co-operative Societies, West Bengal",
  Delhi: "Registrar of Co-operative Societies, Delhi",
  Puducherry: "Registrar of Co-operative Societies, Puducherry",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function StepRegistration() {
  const bankRegistration = useOnboardingStore((s) => s.bankRegistration);
  const setBankRegistration = useOnboardingStore((s) => s.setBankRegistration);
  const [selectedState, setSelectedState] = useState<string>("");
  const [ucbType, setUcbType] = useState<"SCHEDULED" | "NON_SCHEDULED">(
    "NON_SCHEDULED",
  );

  const form = useForm<BankRegistrationFormData>({
    resolver: zodResolver(bankRegistrationSchema),
    defaultValues: bankRegistration ?? {
      bankName: "",
      shortName: "",
      rbiLicenseNumber: "",
      state: "",
      city: "",
      registrationNo: "",
      registeredWith: "",
      ucbType: "NON_SCHEDULED",
      scheduledDate: "",
      establishedDate: "",
      pan: "",
      cin: "",
    },
  });

  // Auto-save to store (debounced 500ms) — setter is stable via selector
  useFormAutoSave(form, setBankRegistration);

  // Pre-fill "Registered With" when state changes
  const handleStateChange = (state: string) => {
    setSelectedState(state);
    form.setValue("state", state);
    if (STATE_TO_RCS[state]) {
      form.setValue("registeredWith", STATE_TO_RCS[state]);
    }
  };

  // Handle UCB type change
  const handleUcbTypeChange = (type: "SCHEDULED" | "NON_SCHEDULED") => {
    setUcbType(type);
    form.setValue("ucbType", type);
    if (type === "NON_SCHEDULED") {
      form.setValue("scheduledDate", "");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Bank Registration Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Basic Information</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bankName">
                  Bank Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="bankName"
                  placeholder="e.g., Apex Sahakari Bank Ltd."
                  {...form.register("bankName")}
                />
                {form.formState.errors.bankName && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.bankName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shortName">
                  Short Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="shortName"
                  placeholder="e.g., Apex Bank"
                  {...form.register("shortName")}
                />
                {form.formState.errors.shortName && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.shortName.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="rbiLicenseNumber">
                  RBI License Number <span className="text-red-500">*</span>
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">
                        Format: UCB-XX-YYYY-NNNN
                        <br />
                        Example: UCB-MAH-1985-1234
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="rbiLicenseNumber"
                placeholder="UCB-MAH-1985-1234"
                {...form.register("rbiLicenseNumber")}
              />
              {form.formState.errors.rbiLicenseNumber && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.rbiLicenseNumber.message}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Location</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="state">
                  State <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedState || form.getValues("state")}
                  onValueChange={handleStateChange}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.state && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.state.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">
                  City <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="city"
                  placeholder="e.g., Mumbai"
                  {...form.register("city")}
                />
                {form.formState.errors.city && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.city.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Registration */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Registration</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrationNo">
                  Registration Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="registrationNo"
                  placeholder="e.g., RCS/MAH/1985/001"
                  {...form.register("registrationNo")}
                />
                {form.formState.errors.registrationNo && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.registrationNo.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="registeredWith">
                  Registered With <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="registeredWith"
                  placeholder="Auto-filled based on state"
                  {...form.register("registeredWith")}
                  className={cn(
                    STATE_TO_RCS[selectedState || form.getValues("state")] &&
                      "bg-muted",
                  )}
                />
                {form.formState.errors.registeredWith && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.registeredWith.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* UCB Type */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">UCB Classification</h3>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>
                  UCB Type <span className="text-red-500">*</span>
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs text-sm">
                        <strong>Scheduled:</strong> Banks included in the Second
                        Schedule of the RBI Act, 1934. Must meet capital and
                        liquidity requirements.
                        <br />
                        <br />
                        <strong>Non-scheduled:</strong> Banks not in the Second
                        Schedule. Typically smaller UCBs.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <RadioGroup
                value={ucbType || form.getValues("ucbType")}
                onValueChange={(val) =>
                  handleUcbTypeChange(val as "SCHEDULED" | "NON_SCHEDULED")
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="NON_SCHEDULED" id="non-scheduled" />
                  <Label htmlFor="non-scheduled" className="font-normal">
                    Non-scheduled
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="SCHEDULED" id="scheduled" />
                  <Label htmlFor="scheduled" className="font-normal">
                    Scheduled
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {ucbType === "SCHEDULED" && (
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">
                  Scheduled Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  {...form.register("scheduledDate")}
                />
                {form.formState.errors.scheduledDate && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.scheduledDate.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="establishedDate">
                Established Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="establishedDate"
                type="date"
                {...form.register("establishedDate")}
              />
              {form.formState.errors.establishedDate && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.establishedDate.message}
                </p>
              )}
            </div>
          </div>

          {/* Statutory Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Statutory Details</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pan">
                    PAN <span className="text-red-500">*</span>
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-sm">
                          Permanent Account Number
                          <br />
                          Format: ABCDE1234F
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="pan"
                  placeholder="ABCDE1234F"
                  {...form.register("pan")}
                />
                {form.formState.errors.pan && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.pan.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cin">CIN (Optional)</Label>
                <Input
                  id="cin"
                  placeholder="21-character alphanumeric"
                  {...form.register("cin")}
                />
                {form.formState.errors.cin && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.cin.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
