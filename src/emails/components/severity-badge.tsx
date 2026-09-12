import { Text } from "@react-email/components";

interface SeverityBadgeProps {
  severity: string;
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: "#dc2626", text: "#ffffff" },
  HIGH: { bg: "#ea580c", text: "#ffffff" },
  MEDIUM: { bg: "#eab308", text: "#1e293b" },
  LOW: { bg: "#16a34a", text: "#ffffff" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const colors = SEVERITY_COLORS[severity.toUpperCase()] ?? {
    bg: "#94a3b8",
    text: "#ffffff",
  };

  return (
    <Text
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        display: "inline-block",
        fontSize: "11px",
        fontWeight: "bold",
        letterSpacing: "0.5px",
        padding: "2px 8px",
        borderRadius: "4px",
        textTransform: "uppercase" as const,
        margin: 0,
      }}
    >
      {severity}
    </Text>
  );
}
