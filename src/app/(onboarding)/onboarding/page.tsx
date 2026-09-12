import { redirect } from "next/navigation";
import { requireOnboardingPermission } from "@/lib/guards";
import { prismaForTenant } from "@/lib/prisma";
import { OnboardingWizard } from "./_components/onboarding-wizard";

/**
 * Onboarding Page — Server Component
 *
 * Guards:
 * 1. User must be authenticated with admin:manage_settings permission
 * 2. Tenant must NOT already be onboarded (redirects to /dashboard)
 *
 * If checks pass, renders the OnboardingWizard client component.
 */
export default async function OnboardingPage() {
  const session = await requireOnboardingPermission("admin:manage_settings");

  const tenantId = (session.user as Record<string, unknown>).tenantId as
    | string
    | undefined;

  // Check if tenant is already onboarded
  if (tenantId) {
    const prisma = prismaForTenant(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingCompleted: true },
    });

    if (tenant?.onboardingCompleted) {
      redirect("/dashboard?message=onboarding_already_completed");
    }
  }

  return (
    <OnboardingWizard
      tenantId={tenantId ?? null}
      userName={(session.user as Record<string, unknown>).name as string}
    />
  );
}
