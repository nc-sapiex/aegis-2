import { Text, Section } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { SeverityBadge } from "../components/severity-badge";
import { CtaButton } from "../components/cta-button";

interface BulkObservation {
  title: string;
  severity: string;
  branchName: string;
  dueDate: string;
}

interface BulkDigestEmailProps {
  bankName: string;
  appUrl: string;
  observations: BulkObservation[];
  auditeePortalUrl: string;
}

export function BulkDigestEmail({
  bankName,
  appUrl,
  observations,
  auditeePortalUrl,
}: BulkDigestEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`${observations.length} new observations assigned to you`}
    >
      <Text style={headingStyle}>
        {observations.length} New Observations Assigned
      </Text>
      <Text style={subtitleStyle}>
        The following observations have been assigned to you for response.
      </Text>

      <Section style={tableContainerStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <thead>
            <tr style={headerRowStyle}>
              <th style={thStyle}>Observation</th>
              <th style={{ ...thStyle, textAlign: "center" as const }}>
                Severity
              </th>
              <th style={{ ...thStyle, textAlign: "center" as const }}>
                Branch
              </th>
              <th style={{ ...thStyle, textAlign: "right" as const }}>
                Due Date
              </th>
            </tr>
          </thead>
          <tbody>
            {observations.map((obs, i) => (
              <tr key={i} style={rowStyle}>
                <td style={tdStyle}>
                  <Text style={obsTitleStyle}>{obs.title}</Text>
                </td>
                <td style={{ ...tdStyle, textAlign: "center" as const }}>
                  <SeverityBadge severity={obs.severity} />
                </td>
                <td style={{ ...tdStyle, textAlign: "center" as const }}>
                  <Text style={cellTextStyle}>{obs.branchName}</Text>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" as const }}>
                  <Text style={cellTextStyle}>{obs.dueDate}</Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <CtaButton href={auditeePortalUrl} text="View All Observations" />

      <Text style={instructionStyle}>
        Please review and respond to each observation before the respective due
        dates.
      </Text>
    </EmailBaseLayout>
  );
}

export function getBulkDigestSubject(bankName: string, count: number): string {
  return `[${bankName}] ${count} new observations assigned to you`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "bold",
  color: "#1e293b",
  margin: "0 0 4px 0",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  margin: "0 0 24px 0",
};

const tableContainerStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  overflow: "hidden",
};

const headerRowStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
};

const thStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "600",
  color: "#64748b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  padding: "10px 12px",
  textAlign: "left" as const,
  borderBottom: "1px solid #e2e8f0",
};

const rowStyle: React.CSSProperties = {
  borderBottom: "1px solid #f1f5f9",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle" as const,
};

const obsTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: "500",
  color: "#1e293b",
  margin: 0,
};

const cellTextStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748b",
  margin: 0,
};

const instructionStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#64748b",
  lineHeight: "1.5",
};
