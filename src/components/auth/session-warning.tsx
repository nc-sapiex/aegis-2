"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";

/**
 * Session timeout warning component
 *
 * Features:
 * - Checks session expiry periodically (every 60 seconds)
 * - Shows warning when session expires in < 5 minutes (Recommendation SA)
 * - Toast message: "Your session expires in X minutes. Save your work."
 * - Auto-saves current form data to localStorage before session expiry
 * - Redirects to /login with ?expired=true when session expires
 * - Login page shows "Session expired" message when expired=true
 */
export function SessionWarning() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [warningShown, setWarningShown] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.session) {
      // Not authenticated, nothing to do
      return;
    }

    const checkSessionExpiry = () => {
      const expiresAt = new Date(session.session.expiresAt);
      const now = new Date();
      const timeLeftMs = expiresAt.getTime() - now.getTime();
      const timeLeftMinutes = Math.floor(timeLeftMs / (1000 * 60));

      setTimeRemaining(timeLeftMinutes);

      // Show warning when < 5 minutes remaining
      if (timeLeftMinutes < 5 && timeLeftMinutes > 0 && !warningShown) {
        setWarningShown(true);
        // Auto-save current form data to localStorage
        // This is a simple implementation - real app would have more sophisticated logic
        try {
          const formData = document.querySelectorAll("input, textarea, select");
          const dataToSave: Record<string, string> = {};
          formData.forEach((input) => {
            const name = (input as HTMLInputElement).name;
            const value = (input as HTMLInputElement).value;
            if (name && value) {
              dataToSave[name] = value;
            }
          });
          localStorage.setItem("aegis-autosave", JSON.stringify(dataToSave));
        } catch (err) {
          console.error("Failed to auto-save form data:", err);
        }
      }

      // Redirect to login when session expires
      if (timeLeftMinutes <= 0) {
        router.push("/login?expired=true");
        router.refresh();
      }
    };

    // Check every 60 seconds
    const interval = setInterval(checkSessionExpiry, 60 * 1000);

    // Initial check
    checkSessionExpiry();

    return () => clearInterval(interval);
  }, [session, warningShown, router]);

  // Don't show anything if not authenticated
  if (!session) {
    return null;
  }

  return (
    <>
      {/* Session expiry warning */}
      {warningShown && timeRemaining !== null && (
        <div className="animate-in slide-in-from-right-4 fixed right-4 bottom-4 z-50 w-80">
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-start gap-3">
              {/* Warning icon */}
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-amber-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h-4a3 3 0 01-3-3v10a3 3 0 013 3h10a3 3 0 013-3V6a3 3 0 01-3-3H7z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.29 3.86L1.82 8a5 5 0 00-.8 1.08l8 4a5 5 0 00-.84-1.16L14.15 3a5 5 0 00-.8 1.1l-8 4a5 5 0 00.84 1.16l8 4a5 5 0 00.8-1.1l-8-4z"
                  />
                </svg>
              </div>

              {/* Message */}
              <div className="flex-1">
                <p className="text-foreground text-sm font-medium">
                  Session expires soon
                </p>
                <p className="text-muted-foreground text-xs">
                  Your session expires in {timeRemaining} minute
                  {timeRemaining !== 1 ? "s" : ""}. Save your work.
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setWarningShown(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
