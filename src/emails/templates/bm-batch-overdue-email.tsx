import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface BmBatchOverdueEmailProps {
  bankName: string;
  appUrl: string;
  branchName: string;
  engagementId: string;
  overdueDays: number;
  batchId: string;
}

export function BmBatchOverdueEmail({
  bankName,
  appUrl,
  branchName,
  engagementId,
  overdueDays,
  batchId,
}: BmBatchOverdueEmailProps) {
  const engagementUrl = `${appUrl}/audit-execution/${engagementId}/report`;

  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`BM Response Overdue: ${branchName} — ${overdueDays} day${overdueDays !== 1 ? "s" : ""} past deadline`}
    >
      <Section style={alertBoxStyle}>
        <Text style={alertLabel}>BM Response Batch Overdue</Text>
        <Text style={overdueCountStyle}>
          {overdueDays} day{overdueDays !== 1 ? "s" : ""} past deadline
        </Text>
      </Section>

      <Section style={detailsBoxStyle}>
        <Text style={titleStyle}>Branch Manager Response Overdue</Text>
        <Text style={metaStyle}>
          <strong>Branch:</strong> {branchName}
        </Text>
        <Text style={metaStyle}>
          <strong>Batch ID:</strong> {batchId.slice(0, 8)}...
        </Text>
        <Text style={metaStyle}>
          <strong>Days overdue:</strong> {overdueDays}
        </Text>
      </Section>

      <CtaButton href={engagementUrl} text="View Engagement" />

      <Text style={instructionStyle}>
        The Branch Manager response for <strong>{branchName}</strong> is{" "}
        {overdueDays} day{overdueDays !== 1 ? "s" : ""} past the deadline.
        Please follow up with the Branch Manager to ensure timely response
        submission.
      </Text>
    </EmailBaseLayout>
  );
}

export function getBmBatchOverdueSubject(branchName: string): string {
  return `[AEGIS] BM Response Overdue — ${branchName}`;
}

const alertBoxStyle: React.CSSProperties = {
  backgroundColor: "#fff7ed",
  borderRadius: "8px",
  padding: "20px",
  borderLeft: "4px solid #ea580c",
  marginBottom: "16px",
  textAlign: "center" as const,
};

const alertLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#ea580c",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  margin: "0 0 4px 0",
};

const overdueCountStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#ea580c",
  margin: "0",
};

const detailsBoxStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #e2e8f0",
};

const titleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#1e293b",
  margin: "0 0 8px 0",
};

const metaStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#475569",
  margin: "4px 0",
};

const instructionStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  lineHeight: "1.5",
};
