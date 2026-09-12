"use client";

import { Badge } from "@/components/ui/badge";
import { ShieldAlert, AlertCircle, Info, CheckCircle } from "@/lib/icons";
import { SEVERITY_BADGE_COLORS } from "@/lib/constants";
import type { LucideIcon } from "lucide-react";

// ─── Icon map ─────────────────────────────────────────────────────────────────

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  CRITICAL: ShieldAlert,
  HIGH: AlertCircle,
  MEDIUM: Info,
  LOW: CheckCircle,
  critical: ShieldAlert,
  high: AlertCircle,
  medium: Info,
  low: CheckCircle,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface SeverityBadgeProps {
  /** Severity value — supports both UPPERCASE and lowercase keys */
  severity: string;
  /** Optional label override; defaults to title-cased severity */
  label?: string;
  /** Extra className merged onto the Badge */
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Accessible severity badge with a leading icon for color-blind differentiation.
 *
 * Icons:
 * - Critical → ShieldAlert
 * - High     → AlertCircle
 * - Medium   → Info
 * - Low      → CheckCircle
 */
export function SeverityBadge({
  severity,
  label,
  className,
}: SeverityBadgeProps) {
  const upperKey = severity.toUpperCase();
  const colorClass =
    SEVERITY_BADGE_COLORS[upperKey] ?? SEVERITY_BADGE_COLORS[severity] ?? "";
  const Icon = SEVERITY_ICONS[severity] ?? SEVERITY_ICONS[upperKey];
  const displayLabel =
    label ?? severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();

  return (
    <Badge
      variant="outline"
      className={`${colorClass} ${className ?? ""}`.trim()}
    >
      {Icon && <Icon className="mr-1 h-3 w-3" aria-hidden="true" />}
      {displayLabel}
    </Badge>
  );
}
