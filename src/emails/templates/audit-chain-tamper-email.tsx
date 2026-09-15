import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface AuditChainTamperEmailProps {
  bankName: string;
  appUrl: string;
  firstBadSequence: string;
}

export function AuditChainTamperEmail({
  bankName,
  appUrl,
  firstBadSequence,
}: AuditChainTamperEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`CRITICAL: audit trail verification failed at entry #${firstBadSequence}`}
    >
      <Section style={alertBoxStyle}>
        <Text style={alertLabel}>Critical</Text>
        <Text style={headlineStyle}>Audit trail verification failed</Text>
      </Section>

      <Text style={bodyStyle}>
        The nightly hash-chain check found that audit trail entry{" "}
        <strong>#{firstBadSequence}</strong> no longer matches what was
        recorded. An entry may have been edited or deleted outside the
        application. Every entry from that point on is unverified until this is
        investigated.
      </Text>

      <CtaButton
        href={`${appUrl}/admin/audit-chain`}
        text="View verification history"
      />
    </EmailBaseLayout>
  );
}

export function getAuditChainTamperSubject(bankName: string): string {
  return `[AEGIS] CRITICAL: audit trail verification failed — ${bankName}`;
}

const alertBoxStyle: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  padding: "20px",
  borderLeft: "4px solid #dc2626",
  marginBottom: "16px",
  textAlign: "center" as const,
};

const alertLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#dc2626",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  margin: "0 0 4px 0",
};

const headlineStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#dc2626",
  margin: "0",
};

const bodyStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#334155",
  lineHeight: "1.5",
};
