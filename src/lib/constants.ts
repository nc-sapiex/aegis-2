export const APP_NAME = "AEGIS";
export const APP_FULL_NAME = "AEGIS Audit & Compliance Platform";
export const APP_DESCRIPTION =
  "Internal Audit & RBI Compliance Management for Urban Cooperative Banks";

export const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
} as const;

export const STATUS_COLORS = {
  compliant: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  "non-compliant": "bg-red-100 text-red-800 border-red-200",
  pending: "bg-slate-100 text-slate-700 border-slate-200",
} as const;

export const FINDING_STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-blue-100 text-blue-800 border-blue-200",
  reviewed: "bg-purple-100 text-purple-800 border-purple-200",
  responded: "bg-amber-100 text-amber-800 border-amber-200",
  closed: "bg-emerald-100 text-emerald-800 border-emerald-200",
} as const;

export const OBSERVATION_STATUS_COLORS = {
  DRAFT: "border-gray-300 bg-gray-50 text-gray-700",
  SUBMITTED: "border-blue-300 bg-blue-50 text-blue-700",
  REVIEWED: "border-purple-300 bg-purple-50 text-purple-700",
  ISSUED: "border-orange-300 bg-orange-50 text-orange-700",
  RESPONSE: "border-yellow-300 bg-yellow-50 text-yellow-700",
  COMPLIANCE: "border-teal-300 bg-teal-50 text-teal-700",
  CLOSED: "border-green-300 bg-green-50 text-green-700",
} as const;

export const OBSERVATION_STATUS_ORDER: Record<string, number> = {
  DRAFT: 0,
  SUBMITTED: 1,
  REVIEWED: 2,
  ISSUED: 3,
  RESPONSE: 4,
  COMPLIANCE: 5,
  CLOSED: 6,
};

export const RISK_CATEGORIES = [
  { id: "credit-risk", label: "Credit Risk" },
  { id: "market-risk", label: "Market Risk" },
  { id: "operational-risk", label: "Operational Risk" },
  { id: "liquidity-risk", label: "Liquidity Risk" },
  { id: "compliance-risk", label: "Compliance Risk" },
  { id: "it-risk", label: "IT & Cyber Risk" },
  { id: "governance-risk", label: "Governance Risk" },
  { id: "aml-cft", label: "AML/CFT" },
] as const;

export const AUDIT_STATUS_COLORS = {
  completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "in-progress": "bg-blue-100 text-blue-800 border-blue-200",
  planned: "bg-slate-100 text-slate-700 border-slate-200",
  "on-hold": "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
} as const;

/** Engagement status badge styles (keys match EngagementStatus enum) */
export const ENGAGEMENT_STATUS_STYLES: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  TEAM_ASSIGNED: "bg-indigo-100 text-indigo-800",
  OPENING_MEETING: "bg-purple-100 text-purple-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  EXIT_MEETING: "bg-amber-100 text-amber-800",
  REPORT_DRAFT: "bg-cyan-100 text-cyan-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

/** Rating band badge classes — for Badge/chip display in RBIA components */
export const RATING_BAND_BADGE_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  VERY_GOOD: {
    label: "Very Good",
    className: "bg-green-700 text-white border-transparent",
  },
  GOOD: {
    label: "Good",
    className: "bg-green-500 text-white border-transparent",
  },
  SATISFACTORY: {
    label: "Satisfactory",
    className: "bg-yellow-500 text-black border-transparent",
  },
  MODERATE: {
    label: "Moderate",
    className: "bg-orange-500 text-white border-transparent",
  },
  POOR: {
    label: "Poor",
    className: "bg-red-600 text-white border-transparent",
  },
};

/** Rating band label → badge class (for display-name keyed lookups) */
export function getRatingBandBadgeClass(label: string): string {
  switch (label) {
    case "Very Good":
      return "bg-green-700 text-white";
    case "Good":
      return "bg-green-500 text-white";
    case "Satisfactory":
      return "bg-yellow-400 text-black";
    case "Moderate":
      return "bg-orange-500 text-white";
    case "Poor":
      return "bg-red-600 text-white";
    default:
      return "";
  }
}

/**
 * Severity badge colors — UPPERCASE keys matching DB enum values.
 * Use this for components that receive severity as CRITICAL/HIGH/MEDIUM/LOW.
 */
export const SEVERITY_BADGE_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

/**
 * Icon name per severity level (import the icons from @/lib/icons).
 * Used to add accessible severity indicators for color-blind users.
 */
export const SEVERITY_ICON_NAMES: Record<string, string> = {
  CRITICAL: "ShieldAlert",
  HIGH: "AlertCircle",
  MEDIUM: "Info",
  LOW: "CheckCircle",
  critical: "ShieldAlert",
  high: "AlertCircle",
  medium: "Info",
  low: "CheckCircle",
};

/** Issue source badge colors (keys match IssueSource enum) */
export const ISSUE_SOURCE_COLORS: Record<string, string> = {
  INTERNAL_AUDIT: "bg-blue-100 text-blue-800 border-blue-300",
  REGULATORY: "bg-purple-100 text-purple-800 border-purple-300",
  EXTERNAL_AUDIT: "bg-indigo-100 text-indigo-800 border-indigo-300",
  SELF_ASSESSMENT: "bg-green-100 text-green-800 border-green-300",
  CONCURRENT: "bg-teal-100 text-teal-800 border-teal-300",
};

/** Issue status badge colors (keys match IssueStatus enum) */
export const ISSUE_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-800 border-red-300",
  IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
  CLOSED: "bg-green-100 text-green-800 border-green-300",
  ACCEPTED_RISK: "bg-amber-100 text-amber-800 border-amber-300",
};

/** ATR status badge colors (keys match ATR workflow states) */
export const ATR_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 border-gray-300",
  SUBMITTED: "bg-blue-100 text-blue-800 border-blue-300",
  ACCEPTED: "bg-green-100 text-green-800 border-green-300",
  FURTHER_INFO: "bg-orange-100 text-orange-800 border-orange-300",
  CLOSED: "bg-purple-100 text-purple-800 border-purple-300",
};

/** Compliance item status badge colors */
export const COMPLIANCE_STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 border-blue-300",
  BRANCH_RESPONSE_DUE: "bg-orange-100 text-orange-800 border-orange-300",
  BRANCH_RESPONSE_SUBMITTED: "bg-yellow-100 text-yellow-800 border-yellow-300",
  ZAC_REVIEW: "bg-purple-100 text-purple-800 border-purple-300",
  ZAC_APPROVED: "bg-green-100 text-green-800 border-green-300",
  ZAC_REJECTED: "bg-red-100 text-red-800 border-red-300",
  CLOSED: "bg-gray-100 text-gray-800 border-gray-300",
};

/** Rating band colors with bg/text/fill — used by RBIA gauge & drilldown components */
export const RATING_BAND_COLORS: Record<
  string,
  { bg: string; text: string; fill: string; badgeBg: string }
> = {
  VERY_GOOD: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    fill: "#059669",
    badgeBg: "bg-emerald-100 text-emerald-800",
  },
  GOOD: {
    bg: "bg-green-100",
    text: "text-green-700",
    fill: "#16a34a",
    badgeBg: "bg-green-100 text-green-700",
  },
  SATISFACTORY: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    fill: "#ca8a04",
    badgeBg: "bg-yellow-100 text-yellow-800",
  },
  MODERATE: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    fill: "#ea580c",
    badgeBg: "bg-orange-100 text-orange-800",
  },
  POOR: {
    bg: "bg-red-100",
    text: "text-red-800",
    fill: "#dc2626",
    badgeBg: "bg-red-100 text-red-800",
  },
};

/** Rating band labels for display */
export const RATING_BAND_LABELS: Record<string, string> = {
  VERY_GOOD: "Very Good",
  GOOD: "Good",
  SATISFACTORY: "Satisfactory",
  MODERATE: "Moderate",
  POOR: "Poor",
};

/** Get rating band colors with sensible fallback for null/unknown bands */
export function getRatingBandColors(band: string | null) {
  if (!band || !RATING_BAND_COLORS[band]) {
    return {
      bg: "bg-muted",
      text: "text-muted-foreground",
      fill: "hsl(var(--muted-foreground))",
      badgeBg: "bg-muted text-muted-foreground",
    };
  }
  return RATING_BAND_COLORS[band];
}

/** Score label badge colors (keys match ScoreLabel enum) */
export const SCORE_LABEL_COLORS: Record<string, string> = {
  FULLY_COMPLIANT: "bg-green-100 text-green-800",
  LARGELY_COMPLIANT: "bg-amber-100 text-amber-800",
  PARTIALLY_COMPLIANT: "bg-orange-100 text-orange-800",
  NON_COMPLIANT: "bg-red-100 text-red-800",
};

/** RBIA score button styles (keys match ScoreLabel enum) */
export const SCORE_BUTTON_STYLES: Record<
  string,
  { active: string; label: string }
> = {
  FULLY_COMPLIANT: {
    active: "bg-green-500 text-white hover:bg-green-600 border-green-500",
    label: "FC",
  },
  LARGELY_COMPLIANT: {
    active: "bg-yellow-400 text-black hover:bg-yellow-500 border-yellow-400",
    label: "LC",
  },
  PARTIALLY_COMPLIANT: {
    active: "bg-orange-500 text-white hover:bg-orange-600 border-orange-500",
    label: "PC",
  },
  MARGINALLY_COMPLIANT: {
    active: "bg-red-400 text-white hover:bg-red-500 border-red-400",
    label: "MC",
  },
  NON_COMPLIANT: {
    active: "bg-red-600 text-white hover:bg-red-700 border-red-600",
    label: "NC",
  },
};
