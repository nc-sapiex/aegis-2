"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/stores/onboarding-store";
import type { OnboardingStep } from "@/types/onboarding";
import { STEP_SCHEMAS } from "@/lib/onboarding-validation";
import { StepIndicator } from "./step-indicator";
import { StepNavigation } from "./step-navigation";
import { StepRegistration } from "./step-1-registration";
import { StepTierSelection } from "./step-2-tier-selection";
import { StepRbiDirections } from "./step-3-rbi-directions";
import { StepOrgStructure } from "./step-4-org-structure";
import { StepUserInvites } from "./step-5-user-invites";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/lib/icons";

// ─── Props ──────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  tenantId: string | null;
  userName: string;
}

// ─── Step data extraction for validation ────────────────────────────────────

function getStepData(
  step: OnboardingStep,
  store: ReturnType<typeof useOnboardingStore.getState>,
) {
  switch (step) {
    case 1:
      return store.bankRegistration ?? {};
    case 2:
      return store.tierSelection ?? {};
    case 3:
      return { selectedDirections: store.selectedDirections };
    case 4:
      return store.orgStructure ?? { departments: [], branches: [] };
    case 5:
      return { userInvites: store.userInvites };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard({
  tenantId: _tenantId,
  userName,
}: OnboardingWizardProps) {
  const router = useRouter();
  const store = useOnboardingStore();
  const [showResume, setShowResume] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Check for expired or resumable state on mount, load from server
  useEffect(() => {
    let mounted = true;
    async function init() {
      if (store.isExpired()) {
        store.reset();
        return;
      }
      // Try server state first
      await store.loadFromServer().catch(() => {});
      if (!mounted) return;
      if (store.hasProgress() && store.currentStep > 1) {
        setShowResume(true);
        setShowWelcome(false);
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Navigation handlers ──────────────────────────────────────────────

  const handleNext = useCallback(async () => {
    setIsValidating(true);
    setValidationErrors([]);

    try {
      const schema = STEP_SCHEMAS[store.currentStep];
      const data = getStepData(store.currentStep, store);
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues.map((i) => i.message);
        setValidationErrors(errors);
        return;
      }

      store.markStepComplete(store.currentStep);

      if (store.currentStep < 5) {
        store.setStep((store.currentStep + 1) as OnboardingStep);
      }
      // Step 5 completion is handled by the completion flow (10-07)

      // Save to server (fire-and-forget, don't block navigation)
      store.saveToServer().catch(console.error);
    } finally {
      setIsValidating(false);
    }
  }, [store]);

  const handleBack = useCallback(() => {
    setValidationErrors([]);
    if (store.currentStep > 1) {
      store.setStep((store.currentStep - 1) as OnboardingStep);
    }
  }, [store]);

  const handleSaveAndExit = useCallback(async () => {
    // Persist to server before exiting
    try {
      await store.saveToServer();
    } catch {
      // Don't block exit on server save failure
    }
    router.push("/dashboard");
  }, [router, store]);

  const handleResume = useCallback(() => {
    setShowResume(false);
  }, []);

  const handleStartFresh = useCallback(() => {
    store.reset();
    setShowResume(false);
  }, [store]);

  // ─── Resume detection prompt ──────────────────────────────────────────

  if (showResume) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Resume Onboarding?</CardTitle>
          <CardDescription>
            You have an onboarding session in progress (Step {store.currentStep}{" "}
            of 5).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={handleResume} className="flex-1">
            Resume where I left off
          </Button>
          <Button
            variant="outline"
            onClick={handleStartFresh}
            className="flex-1"
          >
            Start fresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Welcome screen (first visit) ────────────────────────────────────

  if (showWelcome && store.currentStep === 1 && !store.hasProgress()) {
    return (
      <div className="space-y-6">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <CardTitle>Welcome to AEGIS, {userName}!</CardTitle>
            <CardDescription>
              Let&apos;s set up your bank&apos;s audit management system. This
              wizard will guide you through 5 steps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground space-y-2 text-sm">
              <p>You&apos;ll need:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Bank registration details (RBI license, PAN)</li>
                <li>UCB tier classification</li>
                <li>Branch and department information</li>
                <li>Email addresses for key staff</li>
              </ul>
              <p className="pt-2">
                Typical setup takes 15-20 minutes. You can save and return at
                any time.
              </p>
            </div>
            <Button onClick={() => setShowWelcome(false)} className="w-full">
              Begin Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main wizard view ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <StepIndicator
        currentStep={store.currentStep}
        completedSteps={store.completedSteps}
      />

      {/* Sync status indicator */}
      {store.isSyncing && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </div>
      )}
      {!store.isSyncing && store.lastSyncedAt && (
        <div className="text-muted-foreground text-xs">
          Last saved to cloud:{" "}
          {new Date(store.lastSyncedAt).toLocaleTimeString("en-IN")}
        </div>
      )}

      {/* Step content */}
      {store.currentStep === 1 && <StepRegistration />}
      {store.currentStep === 2 && <StepTierSelection />}
      {store.currentStep === 3 && <StepRbiDirections />}
      {store.currentStep === 4 && <StepOrgStructure />}
      {store.currentStep === 5 && <StepUserInvites />}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
          <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <StepNavigation
        currentStep={store.currentStep}
        isValidating={isValidating}
        isSubmitting={false}
        onNext={handleNext}
        onBack={handleBack}
        onSaveAndExit={handleSaveAndExit}
      />
    </div>
  );
}
