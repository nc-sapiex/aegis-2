import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { SeverityBadge } from "../components/severity-badge";
import { CtaButton } from "../components/cta-button";

interface ResponseEmailProps {
  bankName: string;
  appUrl: string;
  observationTitle: string;
  severity: string;
  auditeeName: string;
  responseTimestamp: string;
  responseExcerpt: string;
  evidenceCount: number;
  reviewUrl: string;
}

export function ResponseEmail({
  bankName,
  appUrl,
  observationTitle,
  severity,
  auditeeName,
  responseTimestamp,
  responseExcerpt,
  evidenceCount,
  reviewUrl,
}: ResponseEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`Auditee response received for: ${observationTitle}`}
    >
      <Text style={headingStyle}>Auditee Response Received</Text>

      <Section style={detailsBoxStyle}>
        <Text style={titleStyle}>{observationTitle}</Text>
        <Text style={metaStyle}>
          <SeverityBadge severity={severity} />
        </Text>
        <Text style={metaStyle}>
          <strong>Responded by:</strong> {auditeeName}
        </Text>
        <Text style={metaStyle}>
          <strong>Submitted:</strong> {responseTimestamp}
        </Text>
        {evidenceCount > 0 && (
          <Text style={metaStyle}>
            <strong>Evidence files:</strong> {evidenceCount}
          </Text>
        )}
      </Section>

      {responseExcerpt && (
        <Section style={responseBoxStyle}>
          <Text style={responseLabel}>Response excerpt:</Text>
          <Text style={responseTextStyle}>{responseExcerpt}</Text>
        </Section>
      )}

      <CtaButton href={reviewUrl} text="Review Response" />
    </EmailBaseLayout>
  );
}

export function getResponseSubject(bankName: string, title: string): string {
  return `[${bankName}] Auditee response received — ${title}`;
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

const responseBoxStyle: React.CSSProperties = {
  backgroundColor: "#eff6ff",
  borderRadius: "6px",
  padding: "12px",
  marginTop: "16px",
  borderLeft: "3px solid #3b82f6",
};

const responseLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "600",
  color: "#64748b",
  textTransform: "uppercase" as const,
  margin: "0 0 4px 0",
};

const responseTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1e293b",
  lineHeight: "1.5",
  margin: 0,
};
