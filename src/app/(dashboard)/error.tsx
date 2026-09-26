"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, RotateCcw } from "@/lib/icons";

/**
 * Dashboard Error Boundary
 *
 * Catches errors within the dashboard layout, keeping the sidebar and
 * navigation visible. Logs to console.error — no error-tracking service is
 * configured (Sentry was removed in the 2.0 seed, see CLAUDE.md) — and
 * provides a retry option.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <AlertCircle className="text-destructive h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>
            This page encountered an error. Your data is safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {error.digest && (
            <div className="bg-muted rounded-md p-3">
              <p className="text-muted-foreground text-xs">
                Error ID: <span className="font-mono">{error.digest}</span>
              </p>
            </div>
          )}
          {process.env.NODE_ENV === "development" && (
            <div className="bg-muted mt-4 rounded-md p-3 text-left">
              <p className="text-foreground text-xs font-semibold">
                Development Error:
              </p>
              <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                {error.message}
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={reset} variant="outline">
            <RotateCcw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
