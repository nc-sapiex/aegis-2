"use client";

/**
 * Zustand store for onboarding wizard state with localStorage persistence.
 *
 * Features:
 * - Persists wizard progress across browser sessions via localStorage
 * - Auto-updates lastSavedAt on every mutation (tracks activity)
 * - 30-day expiry for abandoned drafts
 * - reset() clears all state after successful onboarding completion
 * - partialize excludes action functions from serialization
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  OnboardingState,
  OnboardingActions,
  OnboardingStep,
  BankRegistrationData,
  TierSelectionData,
  SelectedDirectionData,
  NotApplicableItem,
  OrgStructureData,
  UserInviteData,
} from "@/types/onboarding";
import { saveWizardStep, getWizardProgress } from "@/actions/onboarding";

// ─── Constants ───────────────────────────────────────────────────────────────

// TODO: Scope by authenticated user/tenant ID when auth is implemented (Phase 11).
// Currently unscoped — if multiple users share a browser (common in bank branches),
// one user's partial onboarding data is visible to the next.
const STORAGE_KEY = "aegis-onboarding";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Initial State ───────────────────────────────────────────────────────────

function getInitialState(): OnboardingState {
  return {
    currentStep: 1,
    completedSteps: [],
    bankRegistration: null,
    tierSelection: null,
    selectedDirections: [],
    notApplicableItems: [],
    orgStructure: null,
    userInvites: [],
    startedAt: new Date().toISOString(),
    lastSavedAt: new Date().toISOString(),
    onboardingId: undefined,
    lastSyncedAt: null,
    isSyncing: false,
  };
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      // ─── Navigation ──────────────────────────────────────────────────

      setStep: (step: OnboardingStep) =>
        set({ currentStep: step, lastSavedAt: new Date().toISOString() }),

      markStepComplete: (step: OnboardingStep) =>
        set((state) => ({
          completedSteps: [...new Set([...state.completedSteps, step])].sort(),
          lastSavedAt: new Date().toISOString(),
        })),

      unmarkStepComplete: (step: OnboardingStep) =>
        set((state) => ({
          completedSteps: state.completedSteps.filter((s) => s !== step),
          lastSavedAt: new Date().toISOString(),
        })),

      // ─── Step Data Setters ───────────────────────────────────────────

      setBankRegistration: (data: BankRegistrationData) =>
        set({ bankRegistration: data, lastSavedAt: new Date().toISOString() }),

      setTierSelection: (data: TierSelectionData) =>
        set({ tierSelection: data, lastSavedAt: new Date().toISOString() }),

      setSelectedDirections: (data: SelectedDirectionData[]) =>
        set({
          selectedDirections: data,
          lastSavedAt: new Date().toISOString(),
        }),

      setNotApplicableItems: (items: NotApplicableItem[]) =>
        set({
          notApplicableItems: items,
          lastSavedAt: new Date().toISOString(),
        }),

      setOrgStructure: (data: OrgStructureData) =>
        set({ orgStructure: data, lastSavedAt: new Date().toISOString() }),

      setUserInvites: (data: UserInviteData[]) =>
        set({ userInvites: data, lastSavedAt: new Date().toISOString() }),

      setOnboardingId: (id: string) => set({ onboardingId: id }),

      // ─── Utilities ───────────────────────────────────────────────────

      isExpired: () => {
        const lastSaved = new Date(get().lastSavedAt).getTime();
        return Date.now() - lastSaved > EXPIRY_MS;
      },

      hasProgress: () => {
        const state = get();
        return (
          state.completedSteps.length > 0 ||
          state.bankRegistration !== null ||
          state.tierSelection !== null ||
          state.selectedDirections.length > 0 ||
          state.orgStructure !== null ||
          state.userInvites.length > 0
        );
      },

      // ─── Server Sync ─────────────────────────────────────────────────

      saveToServer: async () => {
        set({ isSyncing: true });
        try {
          const state = get();
          const stepData = {
            bankRegistration: state.bankRegistration,
            tierSelection: state.tierSelection,
            selectedDirections: state.selectedDirections,
            notApplicableItems: state.notApplicableItems,
            orgStructure: state.orgStructure,
            userInvites: state.userInvites,
          };

          const result = await saveWizardStep(state.currentStep, stepData);
          if (result.success) {
            set({
              lastSyncedAt: new Date().toISOString(),
              isSyncing: false,
            });
          } else {
            console.error("Server save failed:", result.error);
            set({ isSyncing: false });
          }
        } catch (error) {
          console.error("saveToServer error:", error);
          set({ isSyncing: false });
        }
      },

      loadFromServer: async () => {
        try {
          const result = await getWizardProgress();
          if (result.success && result.data && result.data.stepData) {
            const state = get();
            const serverUpdatedAt = new Date(result.data.updatedAt).getTime();
            const localSavedAt = new Date(state.lastSavedAt).getTime();

            // Only merge if server is newer or local has no progress
            if (serverUpdatedAt > localSavedAt || !state.hasProgress()) {
              const stepData = result.data.stepData as any;

              // Extract and merge step data
              if (stepData.bankRegistration) {
                set({ bankRegistration: stepData.bankRegistration });
              }
              if (stepData.tierSelection) {
                set({ tierSelection: stepData.tierSelection });
              }
              if (stepData.selectedDirections) {
                set({ selectedDirections: stepData.selectedDirections });
              }
              if (stepData.notApplicableItems) {
                set({ notApplicableItems: stepData.notApplicableItems });
              }
              if (stepData.orgStructure) {
                set({ orgStructure: stepData.orgStructure });
              }
              if (stepData.userInvites) {
                set({ userInvites: stepData.userInvites });
              }

              // Update wizard position
              set({
                currentStep: result.data.currentStep as OnboardingStep,
                completedSteps: result.data.completedSteps as OnboardingStep[],
                lastSyncedAt: new Date(result.data.updatedAt).toISOString(),
              });
            }
          }
        } catch (error) {
          // Silently fail — local state is fine
          console.error("loadFromServer error:", error);
        }
      },

      reset: () => set(getInitialState()),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        bankRegistration: state.bankRegistration,
        tierSelection: state.tierSelection,
        selectedDirections: state.selectedDirections,
        notApplicableItems: state.notApplicableItems,
        orgStructure: state.orgStructure,
        userInvites: state.userInvites,
        startedAt: state.startedAt,
        lastSavedAt: state.lastSavedAt,
        onboardingId: state.onboardingId,
        lastSyncedAt: state.lastSyncedAt,
        // isSyncing excluded - it's ephemeral UI state
      }),
      // Auto-clear expired drafts (30 days) on store hydration.
      // Prevents stale PII from persisting indefinitely in localStorage.
      onRehydrateStorage: () => (state) => {
        if (state) {
          const lastSaved = new Date(state.lastSavedAt).getTime();
          if (Date.now() - lastSaved > EXPIRY_MS) {
            state.reset();
          }
        }
      },
    },
  ),
);
