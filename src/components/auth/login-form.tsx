"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Lock, Mail, Shield, CircleAlert } from "@/lib/icons";

/**
 * Login form using Better Auth email/password authentication
 *
 * Features:
 * - Email and password fields
 * - Form validation
 * - Error handling (rate limiting, account lockout)
 * - Redirect to dashboard on success
 * - Last login metadata display after successful login
 */
export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Sign in with Better Auth
      const response = await signIn.email({
        email,
        password,
      });

      if (response.error) {
        // Handle Better Auth errors
        const errorCode = response.error.code || response.error.message;

        switch (errorCode) {
          case "INVALID_EMAIL_OR_PASSWORD":
            setError("Invalid email or password");
            break;
          case "TOO_MANY_ATTEMPTS":
            setError(
              "Too many login attempts. Please try again in 15 minutes.",
            );
            break;
          case "ACCOUNT_LOCKED":
            setError(
              "Account locked due to too many failed attempts. Please try again in 30 minutes.",
            );
            break;
          default:
            setError("Login failed. Please try again.");
        }
      } else if (response.data) {
        // Success - redirect to dashboard
        // Last login metadata is automatically tracked by Better Auth
        router.push("/dashboard");
        router.refresh(); // Refresh to update session state
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Login card */}
      <Card className="w-full border-0 bg-white/70 shadow-xl shadow-slate-200/50 backdrop-blur-md">
        <CardContent className="p-8">
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-2">
            <Image
              src="/logos/aegis-mark.png"
              alt="AEGIS"
              width={56}
              height={56}
              className="h-14 w-14"
              priority
            />
            <div className="flex flex-col items-center">
              <span className="text-foreground text-xl font-bold tracking-wide">
                AEGIS
              </span>
              <span className="text-muted-foreground text-xs tracking-widest">
                SAPIEX TECHNOLOGIES
              </span>
            </div>
            <p className="text-muted-foreground text-center text-sm">
              Audit & Compliance Platform for UCBs
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <div className="flex items-center gap-2 text-sm text-red-700">
                <CircleAlert className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  placeholder="rajesh.deshmukh@apexbank.example"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-200/50 transition-all hover:from-blue-700 hover:to-blue-800 hover:shadow-lg"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {/* Trust indicators */}
          <div className="mt-6 flex items-center justify-center">
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <Shield className="h-3 w-3" />
              <span>RBI Compliant</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <p className="text-muted-foreground text-xs">
        Secured by AEGIS &middot; SAPIEX TECHNOLOGIES
      </p>
    </div>
  );
}
