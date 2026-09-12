/**
 * Onboarding wizard TypeScript types.
 *
 * Maps to the 5-step onboarding wizard flow:
 *   Step 1: Bank Registration
 *   Step 2: Tier Selection
 *   Step 3: RBI Master Direction Selection
 *   Step 4: Organization Structure
 *   Step 5: User Invitations
 */

// ─── UCB Enums (mirrors Prisma but usable on client) ─────────────────────────

export type UcbTier = "TIER_1" | "TIER_2" | "TIER_3" | "TIER_4";

export type PcaStatus = "NONE" | "PCA_1" | "PCA_2" | "PCA_3";

export type UcbType = "SCHEDULED" | "NON_SCHEDULED";

// ─── Step 1: Bank Registration ───────────────────────────────────────────────

export interface BankRegistrationData {
  bankName: string;
  shortName: string;
  rbiLicenseNumber: string;
  state: string;
  city: string;
  registrationNo: string;
  registeredWith: string;
  ucbType: UcbType;
  scheduledDate?: string;
  establishedDate: string;
  pan: string;
  cin?: string;
}

// ─── Step 2: Tier Selection ──────────────────────────────────────────────────

export interface TierSelectionData {
  tier: UcbTier;
  depositAmount?: number;
  multiStateLicense: boolean;
  pcaStatus: PcaStatus;
  lastRbiInspectionDate?: string;
}

// ─── Step 3: RBI Master Direction Selection ──────────────────────────────────

export interface DirectionItemSelection {
  itemCode: string;
  selected: boolean;
  notApplicable: boolean;
  notApplicableReason?: string;
}

export interface SelectedDirectionData {
  masterDirectionId: string;
  selected: boolean;
  items: DirectionItemSelection[];
}

export interface NotApplicableItem {
  itemCode: string;
  reason: string;
}

// ─── Step 4: Organization Structure ──────────────────────────────────────────

export interface DepartmentEntry {
  name: string;
  code: string;
  headName: string;
  headEmail: string;
}

export interface BranchEntry {
  name: string;
  code: string;
  city: string;
  state: string;
  type: string;
  managerName: string;
  managerEmail: string;
}

export interface OrgStructureData {
  departments: DepartmentEntry[];
  branches: BranchEntry[];
}

// ─── Step 5: User Invitations ────────────────────────────────────────────────

export interface UserInviteData {
  name: string;
  email: string;
  roles: string[];
  branchAssignments: string[]; // branch codes for AUDITEE role
}

// ─── Wizard State ────────────────────────────────────────────────────────────

export const ONBOARDING_STEPS = [1, 2, 3, 4, 5] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Bank Registration",
  2: "Tier Selection",
  3: "RBI Directions",
  4: "Organization Structure",
  5: "User Invitations",
};

export interface OnboardingState {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];

  // Per-step data
  bankRegistration: BankRegistrationData | null;
  tierSelection: TierSelectionData | null;
  selectedDirections: SelectedDirectionData[];
  notApplicableItems: NotApplicableItem[];
  orgStructure: OrgStructureData | null;
  userInvites: UserInviteData[];

  // Meta
  startedAt: string;
  lastSavedAt: string;
  onboardingId?: string; // server-side draft ID after first save
  lastSyncedAt: string | null; // ISO timestamp of last successful server save
  isSyncing: boolean; // true while server save is in progress
}

// ─── Store Actions ───────────────────────────────────────────────────────────

export interface OnboardingActions {
  setStep: (step: OnboardingStep) => void;
  markStepComplete: (step: OnboardingStep) => void;
  unmarkStepComplete: (step: OnboardingStep) => void;

  setBankRegistration: (data: BankRegistrationData) => void;
  setTierSelection: (data: TierSelectionData) => void;
  setSelectedDirections: (data: SelectedDirectionData[]) => void;
  setNotApplicableItems: (items: NotApplicableItem[]) => void;
  setOrgStructure: (data: OrgStructureData) => void;
  setUserInvites: (data: UserInviteData[]) => void;
  setOnboardingId: (id: string) => void;

  isExpired: () => boolean;
  hasProgress: () => boolean;
  reset: () => void;

  saveToServer: () => Promise<void>;
  loadFromServer: () => Promise<void>;
}
