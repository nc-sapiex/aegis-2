import { Row, Column, Text } from "@react-email/components";
import { SeverityBadge } from "./severity-badge";

interface ObservationCardProps {
  title: string;
  severity: string;
  branchName: string;
  dueDate: string;
}

export function ObservationCard({
  title,
  severity,
  branchName,
  dueDate,
}: ObservationCardProps) {
  return (
    <Row style={cardStyle}>
      <Column style={{ width: "100%" }}>
        <Text style={titleStyle}>{title}</Text>
        <Text style={metaStyle}>
          <SeverityBadge severity={severity} /> &nbsp; {branchName} &nbsp;
          &middot; &nbsp; Due: {dueDate}
        </Text>
      </Column>
    </Row>
  );
}

const cardStyle: React.CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  padding: "12px 0",
};

const titleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#1e293b",
  margin: "0 0 4px 0",
};

const metaStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#64748b",
  margin: 0,
};
