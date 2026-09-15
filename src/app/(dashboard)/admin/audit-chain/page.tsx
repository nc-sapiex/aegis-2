import { requirePermission } from "@/lib/guards";
import {
  getChainHead,
  getChainVerifications,
} from "@/data-access/audit-chain-admin";
import { AuditChainPanel } from "@/components/admin/audit-chain-panel";

/**
 * Audit chain administration (spec §5): chain head, recent verifications,
 * verify-now, and the examiner attestation export. admin:manage_settings is
 * held by exactly CAE and SYSTEM_ADMIN, the roles the tamper alert emails a
 * link to this page.
 */
export default async function AuditChainAdminPage() {
  const session = await requirePermission("admin:manage_settings");
  const tenantId = session.user.tenantId;
  const [head, history] = await Promise.all([
    getChainHead(tenantId),
    getChainVerifications(tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight md:text-2xl">
          Audit chain
        </h1>
        <p className="text-muted-foreground">
          Every audit trail entry carries the hash of the entry before it, so a
          change or deletion made outside AEGIS breaks the chain. New entries
          are checked every night at 02:00 IST and the whole chain every Sunday.
        </p>
      </div>

      <AuditChainPanel
        head={
          head
            ? {
                entries: head.lastSequence.toString(),
                hash: head.lastHash.toString("hex"),
              }
            : null
        }
        history={history.map((h) => ({
          id: h.id,
          // Formatted here, not in the client, so server and browser agree.
          verifiedAt: h.verifiedAt.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          ok: h.ok,
          firstBadSequence: h.firstBadSequence?.toString() ?? null,
        }))}
      />
    </div>
  );
}
