"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/strings";
import Image from "next/image";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Lock,
  Mail,
  Shield,
  Users,
  CircleAlert,
  CheckCircle2,
} from "@/lib/icons";

/**
 * Signup form using Better Auth email/password authentication
 *
 * Features:
 * - Name, email, password, and confirm password fields
 * - Password strength indicator
 * - Validation: min 8 chars, 1 uppercase, 1 number
 * - Error handling (duplicate email, weak password)
 * - Redirect to dashboard on success
 */
export function SignupForm() {
  const router = useRouter();
  const t = useTranslations("Login");
  const tCommon = useTranslations("Common");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password strength check
  const [passwordStrength, setPasswordStrength] = useState<
    "weak" | "medium" | "strong" | null
  >(null);

  const checkPasswordStrength = (pwd: string) => {
    if (pwd.length < 8) {
      setPasswordStrength(null);
      return;
    }

    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 2) setPasswordStrength("weak");
    else if (score <= 3) setPasswordStrength("medium");
    else setPasswordStrength("strong");
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pwd = e.target.value;
    setPassword(pwd);
    checkPasswordStrength(pwd);
  };

  const getStrengthColor = () => {
    switch (passwordStrength) {
      case "weak":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "strong":
        return "bg-green-500";
      default:
        return "bg-slate-200";
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError(t("passwordsDontMatch"));
      return;
    }

    // Validate password strength
    if (!passwordStrength || passwordStrength === "weak") {
      setError(t("passwordTooWeak"));
      return;
    }

    setIsLoading(true);

    try {
      // Sign up with Better Auth
      const response = await signUp.email({
        email,
        password,
        name,
      });

      if (response.error) {
        // Handle Better Auth errors
        const errorCode = response.error.code || response.error.message;

        switch (errorCode) {
          case "EMAIL_ALREADY_EXISTS":
            setError(t("emailAlreadyExists"));
            break;
          case "WEAK_PASSWORD":
            setError(t("passwordTooWeak"));
            break;
          case "INVALID_EMAIL":
            setError(t("invalidEmail"));
            break;
          default:
            setError(t("signupFailed"));
        }
      } else if (response.data) {
        // Success - redirect to dashboard
        router.push("/dashboard");
        router.refresh(); // Refresh to update session state
      }
    } catch (err) {
      console.error("Signup error:", err);
      setError(t("signupFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Signup card */}
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
                {tCommon("appName")}
              </span>
              <span className="text-muted-foreground text-xs tracking-widest">
                {tCommon("companyName")}
              </span>
            </div>
            <p className="text-muted-foreground text-center text-sm">
              {tCommon("appTagline")}
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

          <form onSubmit={handleSignup} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                {t("fullName")}
              </Label>
              <div className="relative">
                <Users className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="name"
                  type="text"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t("emailAddress")}
              </Label>
              <div className="relative">
                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
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
                {t("password")}
              </Label>
              <div className="relative">
                <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={handlePasswordChange}
                  className="pl-10"
                  required
                />
              </div>
              {/* Password strength indicator */}
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full transition-all ${getStrengthColor()}`}
                      style={{ width: passwordStrength ? "100%" : "0%" }}
                    />
                  </div>
                  {passwordStrength && (
                    <span className="text-xs">
                      {passwordStrength === "strong" && (
                        <CheckCircle2 className="inline h-3 w-3 text-green-500" />
                      )}
                      <span className="capitalize">{passwordStrength}</span>
                    </span>
                  )}
                </div>
              )}
              {/* Password requirements */}
              {password && (
                <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                  <li className="flex items-center gap-1">
                    <CheckCircle2
                      className={`h-3 w-3 ${
                        password.length >= 8
                          ? "text-green-500"
                          : "text-slate-300"
                      }`}
                    />
                    <span>{t("min8Chars")}</span>
                  </li>
                  <li className="flex items-center gap-1">
                    <CheckCircle2
                      className={`h-3 w-3 ${
                        /[A-Z]/.test(password)
                          ? "text-green-500"
                          : "text-slate-300"
                      }`}
                    />
                    <span>{t("oneUppercase")}</span>
                  </li>
                  <li className="flex items-center gap-1">
                    <CheckCircle2
                      className={`h-3 w-3 ${
                        /[0-9]/.test(password)
                          ? "text-green-500"
                          : "text-slate-300"
                      }`}
                    />
                    <span>{t("oneNumber")}</span>
                  </li>
                </ul>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                {t("confirmPassword")}
              </Label>
              <div className="relative">
                <Lock className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder={t("confirmPasswordPlaceholder")}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
              {isLoading ? t("signingUp") : t("signUp")}
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
        {tCommon("securedBy")} &middot; {tCommon("companyName")}
      </p>
    </div>
  );
}
