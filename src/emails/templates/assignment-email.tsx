import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { SeverityBadge } from "../components/severity-badge";
import { CtaButton } from "../components/cta-button";

interface AssignmentEmailProps {
  bankName: string;
  appUrl: string;
  observationTitle: string;
  severity: string;
  branchName: string;
  dueDate: string;
  conditionExcerpt: string;
  observationUrl: string;
}

export function AssignmentEmail({
  bankName,
  appUrl,
  observationTitle,
  severity,
  branchName,
  dueDate,
  conditionExcerpt,
  observationUrl,
}: AssignmentEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`New audit observation assigned: ${observationTitle}`}
    >
      <Text style={headingStyle}>New Observation Assigned</Text>

      <Section style={detailsBoxStyle}>
        <Text style={titleStyle}>{observationTitle}</Text>
        <Text style={metaStyle}>
          <SeverityBadge severity={severity} />
        </Text>
        <Text style={metaStyle}>
          <strong>Branch:</strong> {branchName}
        </Text>
        <Text style={metaStyle}>
          <strong>Due Date:</strong> {dueDate}
        </Text>
      </Section>

      {conditionExcerpt && <Text style={excerptStyle}>{conditionExcerpt}</Text>}

      <CtaButton href={observationUrl} text="View Observation" />

      <Text style={instructionStyle}>
        Please review this observation and submit your response before the due
        date. You can upload supporting evidence through the auditee portal.
      </Text>
    </EmailBaseLayout>
  );
}

export function getAssignmentSubject(bankName: string, title: string): string {
  return `[${bankName}] New audit observation assigned — ${title}`;
}

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: "0 0 16px 0",
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

const excerptStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  marginTop: "16px",
  lineHeight: "1.5",
  fontStyle: "italic",
};

const instructionStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  lineHeight: "1.5",
};
