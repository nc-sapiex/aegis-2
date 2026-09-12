"use client";

import { SessionWarning } from "@/components/auth/session-warning";

/**
 * Client wrapper for session warning.
 *
 * This component is used in the dashboard layout to mount
 * the SessionWarning component (which is a client component).
 *
 * Since the dashboard layout is now a server component (for session validation),
 * we need this client-side wrapper to mount client components.
 */
export function SessionWarningWrapper() {
  return <SessionWarning />;
}
