"use client";

/**
 * Step 2: Tier Selection
 *
 * UCB tier classification based on deposit size.
 * Features:
 * - Deposit amount input with auto-tier suggestion
 * - 4 tier selection cards with deposit ranges and CRAR requirements
 * - Tier implications panel showing enhanced requirements
 * - Additional tier-specific fields (PCA status)
 * - Auto-saves to Zustand store (debounced 500ms)
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useFormAutoSave } from "@/hooks/use-auto-save";
import {
  tierSelectionSchema,
  type TierSelectionFormData,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { UcbTier, PcaStatus } from "@/types/onboarding";

// ─── Constants ──────────────────────────────────────────────────────────────

interface TierInfo {
  tier: UcbTier;
  label: string;
  depositRange: string;
  crar: string;
  features: string[];
}

const TIER_INFO: TierInfo[] = [
  {
    tier: "TIER_1",
    label: "Tier 1",
    depositRange: "< ₹100 Cr",
    crar: "9%",
    features: ["Basic compliance", "Quarterly reporting"],
  },
  {
    tier: "TIER_2",
    label: "Tier 2",
    depositRange: "₹100 Cr - ₹1,000 Cr",
    crar: "9%",
    features: ["Enhanced reporting", "Risk management framework"],
  },
  {
    tier: "TIER_3",
    label: "Tier 3",
    depositRange: "₹1,000 Cr - ₹10,000 Cr",
    crar: "12%",
    features: ["CISO mandatory", "Independent RM", "Pillar 3 disclosures"],
  },
  {
    tier: "TIER_4",
    label: "Tier 4",
    depositRange: "> ₹10,000 Cr",
    crar: "12%",
    features: [
      "Capital Conservation Buffer",
      "Enhanced supervision",
      "Full Basel III",
    ],
  },
];

const ENHANCED_REQUIREMENTS: Record<UcbTier, string[]> = {
  TIER_1: [],
  TIER_2: [],
  TIER_3: [
    "Chief Information Security Officer (CISO)",
    "Independent Risk Management function",
    "Pillar 3 disclosure requirements",
  ],
  TIER_4: [
    "Chief Information Security Officer (CISO)",
    "Independent Risk Management function",
    "Pillar 3 disclosure requirements",
    "Capital Conservation Buffer (2.5% of RWA)",
    "Enhanced RBI supervision",
  ],
};

function suggestTier(depositAmount: number): UcbTier {
  const crores = depositAmount / 10000000; // Convert to crores
  if (crores < 100) return "TIER_1";
  if (crores < 1000) return "TIER_2";
  if (crores < 10000) return "TIER_3";
  return "TIER_4";
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StepTierSelection() {
  const tierSelection = useOnboardingStore((s) => s.tierSelection);
  const setTierSelection = useOnboardingStore((s) => s.setTierSelection);
  const [selectedTier, setSelectedTier] = useState<UcbTier | null>(null);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);
  const [suggestedTier, setSuggestedTier] = useState<UcbTier | null>(null);

  const form = useForm<TierSelectionFormData>({
    resolver: zodResolver(tierSelectionSchema),
    defaultValues: tierSelection ?? {
      tier: "TIER_1",
      depositAmount: undefined,
      multiStateLicense: false,
      pcaStatus: "NONE",
      lastRbiInspectionDate: "",
    },
  });

  // Auto-save to store (debounced 500ms) — setter is stable via selector
  useFormAutoSave(form, setTierSelection);

  // Handle deposit amount change and auto-suggest tier
  const handleDepositChange = (value: string) => {
    const amount = parseFloat(value);
    if (!isNaN(amount) && amount > 0) {
      setDepositAmount(amount);
      const suggested = suggestTier(amount);
      setSuggestedTier(suggested);
      form.setValue("depositAmount", amount);
    } else {
      setDepositAmount(null);
      setSuggestedTier(null);
    }
  };

  // Handle tier selection
  const handleTierSelect = (tier: UcbTier) => {
    setSelectedTier(tier);
    form.setValue("tier", tier);
  };

  const currentTier = selectedTier || form.getValues("tier");

  return (
    <div className="space-y-6">
      {/* Deposit Amount Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deposit Classification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="depositAmount">
              What is your bank&apos;s total deposits (as of last quarter)?
            </Label>
            <div className="relative">
              <span className="text-muted-foreground absolute top-2.5 left-3">
                ₹
              </span>
              <Input
                id="depositAmount"
                type="number"
                placeholder="e.g., 500000000"
                className="pl-8"
                defaultValue={depositAmount ?? undefined}
                onChange={(e) => handleDepositChange(e.target.value)}
              />
            </div>
            {suggestedTier && (
              <div className="bg-muted mt-2 rounded-md p-3">
                <p className="flex items-center gap-2 text-sm">
                  <Info className="h-4 w-4" />
                  Based on your deposit amount, we recommend{" "}
                  <strong>
                    {TIER_INFO.find((t) => t.tier === suggestedTier)?.label}
                  </strong>
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tier Selection Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIER_INFO.map((tierInfo) => (
          <Card
            key={tierInfo.tier}
            className={cn(
              "hover:border-primary cursor-pointer transition-all",
              currentTier === tierInfo.tier &&
                "border-primary ring-primary ring-2 ring-offset-2",
              suggestedTier === tierInfo.tier &&
                currentTier !== tierInfo.tier &&
                "border-blue-400",
            )}
            onClick={() => handleTierSelect(tierInfo.tier)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{tierInfo.label}</CardTitle>
                {suggestedTier === tierInfo.tier &&
                  currentTier !== tierInfo.tier && (
                    <Badge variant="outline" className="text-xs">
                      Suggested
                    </Badge>
                  )}
                {currentTier === tierInfo.tier && (
                  <Badge className="text-xs">Selected</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-muted-foreground text-xs">Deposit Range</p>
                <p className="font-medium">{tierInfo.depositRange}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">
                  Min CRAR Required
                </p>
                <p className="font-medium">{tierInfo.crar}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs">Features</p>
                <ul className="text-muted-foreground space-y-1 text-xs">
                  {tierInfo.features.map((feature, i) => (
                    <li key={i}>• {feature}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Implications Panel */}
      {currentTier && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Tier {currentTier.split("_")[1]} Implications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground text-sm">
                  CRAR Requirement
                </p>
                <p className="text-2xl font-semibold">
                  {TIER_INFO.find((t) => t.tier === currentTier)?.crar}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  Master Directions
                </p>
                <p className="text-2xl font-semibold">10</p>
                <p className="text-muted-foreground text-xs">
                  All UCBs must comply
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  Enhanced Requirements
                </p>
                <p className="text-2xl font-semibold">
                  {ENHANCED_REQUIREMENTS[currentTier].length}
                </p>
                <p className="text-muted-foreground text-xs">
                  Additional for this tier
                </p>
              </div>
            </div>

            {ENHANCED_REQUIREMENTS[currentTier].length > 0 && (
              <div className="border-t pt-4">
                <h4 className="mb-2 text-sm font-medium">
                  Enhanced Requirements for{" "}
                  {TIER_INFO.find((t) => t.tier === currentTier)?.label}:
                </h4>
                <ul className="text-muted-foreground space-y-1 text-sm">
                  {ENHANCED_REQUIREMENTS[currentTier].map((req, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Additional Tier-Specific Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Additional Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="multiStateLicense">Multi-State License</Label>
                  <Switch
                    id="multiStateLicense"
                    checked={form.watch("multiStateLicense")}
                    onCheckedChange={(checked) =>
                      form.setValue("multiStateLicense", checked)
                    }
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Does your bank operate across multiple states?
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="pcaStatus">
                    PCA Status <span className="text-red-500">*</span>
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="text-muted-foreground h-4 w-4 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-sm">
                          Prompt Corrective Action framework. Banks with
                          financial stress are placed under PCA with regulatory
                          restrictions.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={form.watch("pcaStatus")}
                  onValueChange={(val) =>
                    form.setValue("pcaStatus", val as PcaStatus)
                  }
                >
                  <SelectTrigger id="pcaStatus">
                    <SelectValue placeholder="Select PCA status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    <SelectItem value="PCA_1">PCA Level 1</SelectItem>
                    <SelectItem value="PCA_2">PCA Level 2</SelectItem>
                    <SelectItem value="PCA_3">PCA Level 3</SelectItem>
                  </SelectContent>
                </Select>
                {form.watch("pcaStatus") !== "NONE" && (
                  <p className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Bank is under RBI&apos;s Prompt Corrective Action framework
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastRbiInspectionDate">
                Last RBI Inspection Date (Optional)
              </Label>
              <Input
                id="lastRbiInspectionDate"
                type="date"
                {...form.register("lastRbiInspectionDate")}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
