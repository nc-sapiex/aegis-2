"use client";

import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { STEP_LABELS, type OnboardingStep } from "@/types/onboarding";

// ─── Props ──────────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
}

// ─── Short labels for the indicator ─────────────────────────────────────────

const SHORT_LABELS: Record<OnboardingStep, string> = {
  1: "Bank Info",
  2: "Tier",
  3: "RBI Directions",
  4: "Organization",
  5: "Users",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function StepIndicator({
  currentStep,
  completedSteps,
}: StepIndicatorProps) {
  const steps: OnboardingStep[] = [1, 2, 3, 4, 5];

  return (
    <nav aria-label="Onboarding progress" className="w-full">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const isUpcoming = !isCompleted && !isCurrent;

          return (
            <li key={step} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1.5">
                {/* Circle */}
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-primary/10 text-primary",
                    isUpcoming &&
                      "border-muted-foreground/30 text-muted-foreground",
                  )}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "text-center text-xs font-medium",
                    isCurrent && "text-primary",
                    isCompleted && "text-foreground",
                    isUpcoming && "text-muted-foreground",
                  )}
                >
                  <span className="hidden sm:inline">{SHORT_LABELS[step]}</span>
                  <span className="sm:hidden">{step}</span>
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 mb-6 h-0.5 flex-1",
                    completedSteps.includes(step)
                      ? "bg-primary"
                      : "bg-muted-foreground/20",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
      {/* Accessible step count */}
      <p className="sr-only">
        Step {currentStep} of 5: {STEP_LABELS[currentStep]}
      </p>
    </nav>
  );
}
