import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { getQuestionsByModule } from "@/data-access/examination-questions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { QuestionTable } from "@/components/examination-questions/question-table";
import { AddQuestionDialog } from "@/components/examination-questions/add-question-dialog";

// ─── Module metadata ─────────────────────────────────────────────────────────

const CREDIT_MODULES = [
  { code: "CRD-HLN", label: "Housing Loans" },
  { code: "CRD-GLD", label: "Gold Loans" },
  { code: "CRD-VEH", label: "Vehicle Loans" },
  { code: "CRD-AGR", label: "Agriculture Loans" },
  { code: "CRD-MSE", label: "MSME Loans" },
] as const;

// ─── Module tabs component (inline, server-renderable) ────────────────────────

interface ModuleTabsProps {
  modules: typeof CREDIT_MODULES;
  activeModule: string;
  engagementId: string;
}

function ModuleTabs({ modules, activeModule, engagementId }: ModuleTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {modules.map((m) => (
        <Link
          key={m.code}
          href={`/audit-execution/${engagementId}/rbia/questions?moduleCode=${m.code}`}
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
            m.code === activeModule
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {m.label}
        </Link>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

interface QuestionsPageProps {
  params: Promise<{ engagementId: string }>;
  searchParams: Promise<{ moduleCode?: string }>;
}

/**
 * Question management page for HIA/CAE role only.
 *
 * Displays questions for a credit module in a tabbed interface.
 * HIA can add, edit, deactivate, and reactivate examination questions.
 *
 * Access is restricted to users with "audit_execution:manage_sections" permission.
 *
 * Requirements: QMGT-02, QMGT-03
 */
export default async function QuestionsPage({
  params,
  searchParams,
}: QuestionsPageProps) {
  const { engagementId } = await params;
  const { moduleCode: rawModuleCode } = await searchParams;

  // 1. Auth + permission guard — HIA/CAE only
  const session = await getRequiredSession();
  if (!hasPermission(session.user.roles, "audit_execution:manage_sections")) {
    redirect(`/audit-execution/${engagementId}/rbia`);
  }

  // 2. Resolve active module (default to Housing Loans)
  const moduleCode =
    CREDIT_MODULES.find((m) => m.code === rawModuleCode)?.code ?? "CRD-HLN";

  const activeModuleLabel =
    CREDIT_MODULES.find((m) => m.code === moduleCode)?.label ?? "Housing Loans";

  // 3. Fetch all questions for this module including inactive ones (management view)
  const rawQuestions = await getQuestionsByModule(session, moduleCode, true);

  // 4. Serialize: Date → ISO string for client components
  const questions = rawQuestions.map((q) => ({
    ...q,
    createdAt: q.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Question Management</h2>
          <p className="text-muted-foreground text-sm">
            Manage examination questions for credit module audits. Changes apply
            to future examinations — historical responses are preserved.
          </p>
        </div>
        <AddQuestionDialog
          moduleCode={moduleCode}
          engagementId={engagementId}
        />
      </div>

      {/* Module tabs */}
      <ModuleTabs
        modules={CREDIT_MODULES}
        activeModule={moduleCode}
        engagementId={engagementId}
      />

      {/* Active module label */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">{activeModuleLabel}</h3>
        <span className="text-muted-foreground text-sm">
          ({questions.length} question{questions.length !== 1 ? "s" : ""})
        </span>
      </div>

      {/* Question table */}
      <QuestionTable
        questions={questions}
        moduleCode={moduleCode}
        engagementId={engagementId}
      />
    </div>
  );
}
