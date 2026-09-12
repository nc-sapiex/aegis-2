import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { SeverityBadge } from "../components/severity-badge";
import { CtaButton } from "../components/cta-button";

interface EscalationEmailProps {
  bankName: string;
  appUrl: string;
  observationTitle: string;
  severity: string;
  daysOverdue: number;
  dueDate: string;
  branchName: string;
  auditeeName: string;
  observationUrl: string;
}

export function EscalationEmail({
  bankName,
  appUrl,
  observationTitle,
  severity,
  daysOverdue,
  dueDate,
  branchName,
  auditeeName,
  observationUrl,
}: EscalationEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`OVERDUE: ${observationTitle} — Immediate action required`}
    >
      <Section style={alertBoxStyle}>
        <Text style={alertLabel}>OVERDUE — Immediate Action Required</Text>
        <Text style={overdueCountStyle}>
          {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} past deadline
        </Text>
      </Section>

      <Section style={detailsBoxStyle}>
        <Text style={titleStyle}>{observationTitle}</Text>
        <Text style={metaStyle}>
          <SeverityBadge severity={severity} />
        </Text>
        <Text style={metaStyle}>
          <strong>Branch:</strong> {branchName}
        </Text>
        <Text style={metaStyle}>
          <strong>Original due date:</strong> {dueDate}
        </Text>
        <Text style={metaStyle}>
          <strong>Assigned to:</strong> {auditeeName}
        </Text>
      </Section>

      <CtaButton href={observationUrl} text="View Observation" />

      <Text style={instructionStyle}>
        This observation is overdue and requires immediate attention. Please
        ensure a response is submitted at the earliest.
      </Text>
    </EmailBaseLayout>
  );
}

export function getEscalationSubject(bankName: string, title: string): string {
  return `[${bankName}] OVERDUE: ${title} — Immediate action required`;
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

const overdueCountStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#dc2626",
  margin: 0,
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
