import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { SeverityBadge } from "../components/severity-badge";
import { CtaButton } from "../components/cta-button";

interface ReminderEmailProps {
  bankName: string;
  appUrl: string;
  observationTitle: string;
  severity: string;
  daysRemaining: number;
  dueDate: string;
  responseUrl: string;
}

const URGENCY_COLORS: Record<string, { accent: string; bg: string }> = {
  "7": { accent: "#3b82f6", bg: "#eff6ff" }, // blue
  "3": { accent: "#d97706", bg: "#fffbeb" }, // amber
  "1": { accent: "#dc2626", bg: "#fef2f2" }, // red
};

function getUrgencyStyle(days: number) {
  if (days <= 1) return URGENCY_COLORS["1"];
  if (days <= 3) return URGENCY_COLORS["3"];
  return URGENCY_COLORS["7"];
}

export function ReminderEmail({
  bankName,
  appUrl,
  observationTitle,
  severity,
  daysRemaining,
  dueDate,
  responseUrl,
}: ReminderEmailProps) {
  const urgency = getUrgencyStyle(daysRemaining);

  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`Deadline in ${daysRemaining} day(s): ${observationTitle}`}
    >
      <Section
        style={{
          backgroundColor: urgency.bg,
          borderRadius: "8px",
          padding: "20px",
          borderLeft: `4px solid ${urgency.accent}`,
          marginBottom: "16px",
        }}
      >
        <Text
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: urgency.accent,
            margin: "0 0 4px 0",
          }}
        >
          Deadline Reminder
        </Text>
        <Text
          style={{
            fontSize: "28px",
            fontWeight: "bold",
            color: urgency.accent,
            margin: "0 0 4px 0",
          }}
        >
          {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining
        </Text>
        <Text
          style={{
            fontSize: "13px",
            color: "#64748b",
            margin: 0,
          }}
        >
          Due: {dueDate}
        </Text>
      </Section>

      <Section style={detailsBoxStyle}>
        <Text style={titleStyle}>{observationTitle}</Text>
        <Text style={metaStyle}>
          <SeverityBadge severity={severity} />
        </Text>
      </Section>

      <CtaButton href={responseUrl} text="Submit Response" />

      <Text style={instructionStyle}>
        Please submit your response before the deadline to avoid escalation.
      </Text>
    </EmailBaseLayout>
  );
}

export function getReminderSubject(
  bankName: string,
  days: number,
  title: string,
): string {
  return `[${bankName}] Deadline in ${days} day(s) — ${title}`;
}

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
