"use client";

/**
 * Accept Invitation Page
 *
 * Handles the invitation acceptance flow:
 * 1. Extracts token + email from URL params
 * 2. Shows a password setup form
 * 3. Calls acceptInvitation server action
 * 4. Redirects to login on success
 */

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { acceptInvitation } from "@/actions/user-invitations";
import { PasswordSchema } from "@/lib/password-policy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ShieldCheck } from "@/lib/icons";

function AcceptInviteForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!token || !email) {
      setError("Invalid invitation link. Please check your email.");
      return;
    }

    const passwordCheck = PasswordSchema.safeParse(password);
    if (!passwordCheck.success) {
      setError(passwordCheck.error.issues[0].message);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await acceptInvitation(token, email, password);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
      } else {
        setError(result.error ?? "Failed to accept invitation.");
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center py-12">
          <CheckCircle2 className="mb-4 h-12 w-12 text-green-600" />
          <h2 className="text-lg font-semibold">Account Activated!</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Redirecting to login...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!token || !email) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            Invalid invitation link. Please check your email for the correct
            link.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle>Set Up Your Account</CardTitle>
        <CardDescription>
          Create a password for <strong>{email}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Activating...
              </>
            ) : (
              "Activate Account"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Suspense
        fallback={
          <Card className="mx-auto max-w-md">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </CardContent>
          </Card>
        }
      >
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
