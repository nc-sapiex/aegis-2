"use client";

import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { Suspense, useState } from "react";
import { useTranslations } from "@/lib/strings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "next/navigation";
import { CircleAlert, CheckCircle2 } from "@/lib/icons";

/**
 * Authentication page with login and signup tabs
 *
 * Features:
 * - Tab switching between login and signup
 * - Session check: redirect to dashboard if already authenticated
 * - Clean, centered layout with AEGIS branding
 */
function LoginPageInner() {
  const t = useTranslations("Login");
  const tCommon = useTranslations("Common");
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");

  // Check if user was redirected due to session expiry
  const expired = searchParams.get("expired") === "true";

  // Note: Server-side session check is in the (dashboard) layout
  // This page only redirects after successful auth

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4">
      <div className="w-full max-w-md space-y-4">
        {/* Session expired message */}
        {expired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="text-foreground text-sm font-medium">
                  {t("sessionExpired")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("sessionExpiredMessage")}
                </p>
              </div>
            </div>
          </div>
        )}

        <Tabs
          defaultValue="login"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "login" | "signup")}
          className="w-full"
        >
          {/* Tab list */}
          <TabsList className="grid w-full grid-cols-2 bg-white/50 backdrop-blur-sm">
            <TabsTrigger value="login" className="data-[state=active]:bg-white">
              {t("signIn")}
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              className="data-[state=active]:bg-white"
            >
              {t("signUp")}
            </TabsTrigger>
          </TabsList>

          {/* Login tab */}
          <TabsContent value="login" className="mt-4">
            <LoginForm />
          </TabsContent>

          {/* Signup tab */}
          <TabsContent value="signup" className="mt-4">
            <SignupForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * useSearchParams() needs a Suspense boundary for static prerendering. In 1.x
 * next-intl's cookie read made this route dynamic and hid that requirement.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
