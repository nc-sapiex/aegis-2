import { Text } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface PasswordResetEmailProps {
  bankName: string;
  appUrl: string;
  userName: string;
  resetUrl: string;
}

export function PasswordResetEmail({
  bankName,
  appUrl,
  userName,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText="Reset your AEGIS password"
    >
      <Text style={headingStyle}>Reset your password</Text>

      <Text style={bodyTextStyle}>
        {userName}, we received a request to reset your AEGIS password. If you
        did not make this request, ignore this email — your password will not
        change.
      </Text>

      <CtaButton href={resetUrl} text="Reset Password" />

      <Text style={noteStyle}>
        This link expires in 1 hour and can be used once.
      </Text>
    </EmailBaseLayout>
  );
}

export function getPasswordResetSubject(bankName: string): string {
  return `Reset your ${bankName} password`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  color: "#0f172a",
  fontSize: "20px",
  fontWeight: "bold",
  margin: "0 0 16px 0",
};

const bodyTextStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px 0",
};

const noteStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "20px",
  margin: "12px 0 0 0",
};
