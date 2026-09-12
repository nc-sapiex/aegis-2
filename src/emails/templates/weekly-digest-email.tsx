import { Text, Section, Hr } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface DigestMetrics {
  totalOpen: number;
  closedThisWeek: number;
  overdueCount: number;
  newAssignments: number;
  complianceScore?: number;
  complianceChange?: number;
}

interface TopFinding {
  title: string;
  severity: string;
  status: string;
}

interface UpcomingDeadline {
  title: string;
  dueDate: string;
  assignee: string;
}

interface WeeklyDigestEmailProps {
  bankName: string;
  appUrl: string;
  weekDate: string;
  metrics: DigestMetrics;
  topFindings: TopFinding[];
  upcomingDeadlines: UpcomingDeadline[];
  dashboardUrl: string;
}

export function WeeklyDigestEmail({
  bankName,
  appUrl,
  weekDate,
  metrics,
  topFindings,
  upcomingDeadlines,
  dashboardUrl,
}: WeeklyDigestEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`Weekly Audit Summary — Week of ${weekDate}`}
    >
      <Text style={headingStyle}>Weekly Audit Summary</Text>
      <Text style={subtitleStyle}>Week of {weekDate}</Text>

      {/* Key Metrics */}
      <Section style={metricsGridStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <tbody>
            <tr>
              <td style={metricCellStyle}>
                <Text style={metricValueStyle}>{metrics.totalOpen}</Text>
                <Text style={metricLabelStyle}>Open</Text>
              </td>
              <td style={metricCellStyle}>
                <Text style={{ ...metricValueStyle, color: "#16a34a" }}>
                  {metrics.closedThisWeek}
                </Text>
                <Text style={metricLabelStyle}>Closed This Week</Text>
              </td>
              <td style={metricCellStyle}>
                <Text style={{ ...metricValueStyle, color: "#dc2626" }}>
                  {metrics.overdueCount}
                </Text>
                <Text style={metricLabelStyle}>Overdue</Text>
              </td>
              <td style={metricCellStyle}>
                <Text style={{ ...metricValueStyle, color: "#2563eb" }}>
                  {metrics.newAssignments}
                </Text>
                <Text style={metricLabelStyle}>New</Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Compliance Score */}
      {metrics.complianceScore !== undefined && (
        <Section style={complianceBoxStyle}>
          <Text style={complianceLabelStyle}>Compliance Score</Text>
          <Text style={complianceValueStyle}>{metrics.complianceScore}%</Text>
          {metrics.complianceChange !== undefined &&
            metrics.complianceChange !== 0 && (
              <Text
                style={{
                  ...complianceChangeStyle,
                  color: metrics.complianceChange > 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {metrics.complianceChange > 0 ? "+" : ""}
                {metrics.complianceChange}% from last week
              </Text>
            )}
        </Section>
      )}

      <Hr style={hrStyle} />

      {/* Top Findings */}
      {topFindings.length > 0 && (
        <>
          <Text style={sectionTitle}>Top Critical/High Findings</Text>
          <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
            <tbody>
              {topFindings.map((finding, i) => (
                <tr key={i} style={findingRowStyle}>
                  <td style={{ padding: "8px 0" }}>
                    <Text style={findingTitleStyle}>{finding.title}</Text>
                  </td>
                  <td
                    style={{ padding: "8px 0", textAlign: "center" as const }}
                  >
                    <Text style={findingSeverityStyle(finding.severity)}>
                      {finding.severity}
                    </Text>
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right" as const }}>
                    <Text style={findingStatusStyle}>{finding.status}</Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hr style={hrStyle} />
        </>
      )}

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
        <>
          <Text style={sectionTitle}>Upcoming Deadlines (Next 7 Days)</Text>
          <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
            <tbody>
              {upcomingDeadlines.map((deadline, i) => (
                <tr key={i} style={findingRowStyle}>
                  <td style={{ padding: "8px 0" }}>
                    <Text style={findingTitleStyle}>{deadline.title}</Text>
                  </td>
                  <td
                    style={{ padding: "8px 0", textAlign: "center" as const }}
                  >
                    <Text style={findingStatusStyle}>{deadline.dueDate}</Text>
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right" as const }}>
                    <Text style={findingStatusStyle}>{deadline.assignee}</Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <CtaButton href={dashboardUrl} text="View Dashboard" />
    </EmailBaseLayout>
  );
}

export function getWeeklyDigestSubject(
  bankName: string,
  weekDate: string,
): string {
  return `[${bankName}] Weekly Audit Summary — Week of ${weekDate}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: "0 0 4px 0",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#64748b",
  margin: "0 0 24px 0",
};

const metricsGridStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  borderRadius: "8px",
  padding: "16px",
  border: "1px solid #e2e8f0",
  marginBottom: "16px",
};

const metricCellStyle: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "8px",
};

const metricValueStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: "0 0 2px 0",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#94a3b8",
  margin: 0,
  textTransform: "uppercase" as const,
};

const complianceBoxStyle: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "12px",
  marginBottom: "16px",
};

const complianceLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#94a3b8",
  textTransform: "uppercase" as const,
  margin: "0 0 2px 0",
};

const complianceValueStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: 0,
};

const complianceChangeStyle: React.CSSProperties = {
  fontSize: "12px",
  margin: "2px 0 0 0",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "16px 0",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: "0 0 8px 0",
};

const findingRowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};

const findingTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1e293b",
  margin: 0,
};

function findingSeverityStyle(severity: string): React.CSSProperties {
  const colors: Record<string, string> = {
    CRITICAL: "#dc2626",
    HIGH: "#ea580c",
    MEDIUM: "#d97706",
    LOW: "#16a34a",
  };
  return {
    fontSize: "11px",
    fontWeight: "bold",
    color: colors[severity.toUpperCase()] ?? "#64748b",
    margin: 0,
  };
}

const findingStatusStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748b",
  margin: 0,
};
