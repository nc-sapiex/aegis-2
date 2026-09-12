"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save, Loader2 } from "@/lib/icons";
import type { OnboardingStep } from "@/types/onboarding";

// ─── Props ──────────────────────────────────────────────────────────────────

interface StepNavigationProps {
  currentStep: OnboardingStep;
  onBack: () => void;
  onNext: () => void;
  onSaveAndExit: () => void;
  isValidating?: boolean;
  isSubmitting?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StepNavigation({
  currentStep,
  onBack,
  onNext,
  onSaveAndExit,
  isValidating = false,
  isSubmitting = false,
}: StepNavigationProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === 5;
  const isLoading = isValidating || isSubmitting;

  return (
    <div className="flex items-center justify-between border-t pt-6">
      {/* Left side: Back button */}
      <div>
        {!isFirstStep && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            disabled={isLoading}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        )}
      </div>

      {/* Right side: Save & Exit + Next/Complete */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onSaveAndExit}
          disabled={isLoading}
        >
          <Save className="mr-2 h-4 w-4" />
          Save &amp; Exit
        </Button>

        <Button type="button" onClick={onNext} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isSubmitting ? "Saving..." : "Validating..."}
            </>
          ) : isLastStep ? (
            <>
              Complete Onboarding
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          ) : (
            <>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
