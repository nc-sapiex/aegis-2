import { requirePermission } from "@/lib/guards";
import {
  getAuditTrailEntries,
  getAuditTableNames,
  getAuditActionTypes,
} from "@/data-access/audit-trail";
import { AuditTrailTable } from "@/components/audit-trail/audit-trail-table";
import { AuditTrailFilters } from "@/components/audit-trail/audit-trail-filters";

interface AuditTrailPageProps {
  searchParams: Promise<{
    tableName?: string;
    userId?: string;
    actionType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

/**
 * CAE Audit Trail viewer page.
 *
 * Requires audit_trail:read permission (CAE only).
 * Server component that fetches audit entries via DAL.
 */
export default async function AuditTrailPage({
  searchParams,
}: AuditTrailPageProps) {
  // Route guard: CAE only
  const session = await requirePermission("audit_trail:read");
  const tenantId = session.user.tenantId;

  const params = await searchParams;

  // Parse page number
  const page = params.page ? parseInt(params.page, 10) : 1;

  // Fetch audit entries and filter options in parallel
  const [result, tableNames, actionTypes] = await Promise.all([
    getAuditTrailEntries(tenantId, {
      tableName: params.tableName,
      userId: params.userId,
      actionType: params.actionType,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      page,
      pageSize: 50,
    }),
    getAuditTableNames(tenantId),
    getAuditActionTypes(tenantId),
  ]);

  // Serialize BigInt values for client component
  const serializedEntries = result.entries.map((entry) => ({
    ...entry,
    sequenceNumber: entry.sequenceNumber.toString(),
    createdAt: entry.createdAt.toISOString(),
    retentionExpiresAt: entry.retentionExpiresAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Audit Trail
        </h1>
        <p className="text-muted-foreground">
          Complete, tamper-evident log of all data mutations. Entries are
          immutable and retained for 10 years per PMLA 2002.
        </p>
      </div>

      <AuditTrailFilters
        tableNames={tableNames}
        actionTypes={actionTypes}
        currentFilters={{
          tableName: params.tableName ?? "",
          userId: params.userId ?? "",
          actionType: params.actionType ?? "",
          dateFrom: params.dateFrom ?? "",
          dateTo: params.dateTo ?? "",
        }}
      />

      <AuditTrailTable
        entries={serializedEntries}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
      />
    </div>
  );
}
