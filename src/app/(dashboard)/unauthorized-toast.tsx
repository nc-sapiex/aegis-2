"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function UnauthorizedToast() {
  const searchParams = useSearchParams();
  const hasUnauthorized = searchParams.get("unauthorized") === "true";

  useEffect(() => {
    if (hasUnauthorized) {
      // In production, we'd use a proper toast
      // For now, just show browser alert
      alert("You do not have permission to access that page.");
      // Remove query param so it doesn't trigger again on refresh
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [hasUnauthorized]);

  // This component doesn't render anything visible
  // It just shows a browser alert when unauthorized
  return null;
}
