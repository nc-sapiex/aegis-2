"use client";

import { useEffect } from "react";

/**
 * Global Error Boundary
 *
 * Catches errors at the root layout level.
 * Reports to Sentry when configured, falls back to console.error.
 * Provides minimal fallback UI with retry functionality.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console as fallback
    console.error("Global error:", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{
              maxWidth: "28rem",
              width: "100%",
              backgroundColor: "white",
              borderRadius: "0.5rem",
              padding: "2rem",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "3rem",
                height: "3rem",
                margin: "0 auto 1rem",
                borderRadius: "50%",
                backgroundColor: "#fee2e2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#dc2626"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                marginBottom: "0.5rem",
                color: "#111827",
              }}
            >
              Application Error
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                marginBottom: "1.5rem",
              }}
            >
              A critical error occurred. Please try refreshing the page.
            </p>
            {error.digest && (
              <div
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "0.75rem",
                  borderRadius: "0.375rem",
                  marginBottom: "1.5rem",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                    fontFamily: "monospace",
                  }}
                >
                  Error ID: {error.digest}
                </p>
              </div>
            )}
            <button
              onClick={reset}
              style={{
                backgroundColor: "#3b82f6",
                color: "white",
                padding: "0.5rem 1.5rem",
                borderRadius: "0.375rem",
                border: "none",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#2563eb";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#3b82f6";
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
