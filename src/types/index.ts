// Types matching actual demo JSON data shapes

// ─── Database model types (used by DAL and UI) ─────────────────────────────

/**
 * Tenant settings as returned by getTenantSettings DAL function.
 * Matches the Prisma Tenant model fields displayed on the settings page.
 */
export interface TenantSettings {
  id: string;
  name: string;
  shortName: string;
  rbiLicenseNo: string;
  tier: string;
  state: string;
  city: string;
  address: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  incorporationDate: Date | null;
  scheduledBankStatus: boolean;
  multiStateLicense: boolean;
  pcaStatus: string;
  pcaEffectiveDate: Date | null;
  lastRbiInspectionDate: Date | null;
  rbiRiskRating: string | null;
  settings: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Audit log entry as returned by audit trail DAL queries.
 * Matches the AuditLog Prisma model with joined user name.
 */
export interface AuditLogEntry {
  id: string;
  sequenceNumber: bigint;
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: string;
  actionType: string | null;
  oldData: unknown | null;
  newData: unknown | null;
  userId: string | null;
  userName: string | null; // Joined from User table
  justification: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  retentionExpiresAt: Date | null;
  createdAt: Date;
}

// ─── Demo JSON data types ──────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  head: string;
  code: string;
}

export interface Director {
  id: string;
  name: string;
  position: string;
  since: string;
}

export interface BankProfile {
  id: string;
  name: string;
  shortName: string;
  established: string;
  location: string;
  tier: string;
  paidUpCapital: string;
  paidUpCapitalUnit: string;
  businessMix: string;
  businessMixUnit: string;
  rbiLicenseNo: string;
  pan: string;
  cin: string;
  departments: Department[];
  boardOfDirectors: Director[];
  registrationDetails: {
    registeredWith: string;
    registrationDate: string;
    registrationNumber: string;
    ucbType: string;
    scheduledDate: string;
  };
  supervisorDetails: {
    regionalOffice: string;
    department: string;
    circle: string;
  };
  lastFinancials: {
    year: string;
    totalAssets: string;
    totalAdvances: string;
    totalDeposits: string;
    netProfit: string;
    npaPercentage: string;
    crar: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "ceo" | "director" | "auditor" | "officer" | "manager" | "clerk";
  department: string;
  employeeCode: string;
  joinedDate: string;
  qualification: string;
  experience: string;
  status: "active" | "inactive";
}

export interface StaffData {
  staff: StaffMember[];
  metadata: {
    totalStaff: number;
    departments: number;
    lastUpdated: string;
  };
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  location: string;
  address: string;
  manager: string;
  managerId: string;
  phone: string;
  email: string;
  type: string;
  staffCount: number;
  established: string;
  status: "active" | "inactive";
}

export interface ComplianceRequirement {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  reference: string;
  status: "compliant" | "partial" | "non-compliant" | "pending";
  dueDate: string;
  evidenceCount: number;
  assignedTo: string;
  assignedToName: string;
  priority: "critical" | "high" | "medium" | "low";
  lastReviewDate: string;
  nextReviewDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceData {
  complianceRequirements: ComplianceRequirement[];
  summary: {
    total: number;
    compliant: number;
    partial: number;
    "non-compliant": number;
    pending: number;
    categories: Record<string, number>;
    priorityDistribution: Record<string, number>;
    lastUpdated: string;
  };
}

export interface AuditPlan {
  id: string;
  name: string;
  type: string;
  branchId: string;
  branchName: string;
  departmentId: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  assignedTeam: string[];
  status: "completed" | "in-progress" | "planned" | "on-hold" | "cancelled";
  progress: number;
  findingsCount: number;
  criticalFindings: number;
  highFindings: number;
  createdAt: string;
  updatedAt: string;
  notes: string;
}

export interface AuditData {
  auditPlans: AuditPlan[];
  summary: {
    total: number;
    completed: number;
    "in-progress": number;
    planned: number;
    "on-hold": number;
    cancelled: number;
    byType: Record<string, number>;
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    lastUpdated: string;
  };
}

export interface FindingTimeline {
  id: string;
  date: string;
  action: string;
  actor: string;
}

export interface Finding {
  id: string;
  auditId: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "draft" | "submitted" | "reviewed" | "responded" | "closed";
  observation: string;
  rootCause: string;
  riskImpact: string;
  auditeeResponse: string;
  actionPlan: string;
  assignedAuditor: string;
  targetDate: string;
  createdAt: string;
  updatedAt: string;
  timeline: FindingTimeline[];
  relatedCircular: string;
  relatedRequirement: string;
}

export interface FindingsData {
  findings: Finding[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    lastUpdated: string;
  };
}

export interface RbiCircular {
  id: string;
  reference: string;
  date: string;
  title: string;
  category: string;
  description: string;
  keyRequirements: string[];
  applicability: string;
  effectiveDate: string;
  implementationDate: string;
  pdfPath: string | null;
  requirementsExtracted: number;
  relatedFindings: string[];
}
