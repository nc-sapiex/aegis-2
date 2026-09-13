import { AuditChainPanel } from "@/components/admin/audit-chain-panel";
import { getChainHead, getChainVerifications } from "@/data-access/audit-chain-admin";
import { requirePermission } from "@/lib/guards";

export default async function AuditChainAdminPage() {
  const session = await requirePermission("admin:system");
  const [head, history] = await Promise.all([
    getChainHead(session.user.tenantId),
    getChainVerifications(session.user.tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Audit Chain
        </h1>
        <p className="text-muted-foreground">
          Every audited write is chained by hash. Verification is scheduled nightly at 02:00 IST and can also be run on demand.
        </p>
      </div>

      <AuditChainPanel
        head={
          head
            ? {
                lastSequence: head.lastSequence.toString(),
                lastHash: head.lastHash.toString("hex"),
                updatedAt: head.updatedAt.toISOString(),
              }
            : null
        }
        history={history.map((item) => ({
          id: item.id,
          verifiedAt: item.verifiedAt.toISOString(),
          ok: item.ok,
          firstBadSequence: item.firstBadSequence?.toString() ?? null,
        }))}
      />
    </div>
  );
}
