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
import { AlertCircle } from "@/lib/icons";

/**
 * Error Boundary
 *
 * Catches errors in the application and displays a user-friendly error message.
 * Reports to Sentry when configured, falls back to console.error.
 * Provides a "Try again" button to reset the error boundary.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console as fallback
    console.error("Application error:", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="bg-destructive/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <AlertCircle className="text-destructive h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Something went wrong</CardTitle>
          <CardDescription className="mt-2">
            We encountered an unexpected error. Please try again.
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
          <Button onClick={reset} className="w-full sm:w-auto">
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
