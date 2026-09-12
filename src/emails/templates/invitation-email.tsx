import { Text } from "@react-email/components";
import { EmailBaseLayout } from "../components/email-base-layout";
import { CtaButton } from "../components/cta-button";

interface InvitationEmailProps {
  bankName: string;
  appUrl: string;
  inviteeName: string;
  acceptUrl: string;
  expiresOn: string;
}

export function InvitationEmail({
  bankName,
  appUrl,
  inviteeName,
  acceptUrl,
  expiresOn,
}: InvitationEmailProps) {
  return (
    <EmailBaseLayout
      bankName={bankName}
      appUrl={appUrl}
      previewText={`Set your AEGIS password for ${bankName}`}
    >
      <Text style={headingStyle}>You have been invited to AEGIS</Text>

      <Text style={bodyTextStyle}>
        {inviteeName}, an administrator at {bankName} has created an AEGIS
        account for you. Choose a password to activate it.
      </Text>

      <CtaButton href={acceptUrl} text="Activate Your Account" />

      <Text style={noteStyle}>
        This link activates your account and can be used once. It expires on{" "}
        {expiresOn}. If it has expired, ask your administrator to send a new
        invitation.
      </Text>

      <Text style={noteStyle}>
        If you were not expecting this invitation, ignore this email and tell
        your administrator.
      </Text>
    </EmailBaseLayout>
  );
}

export function getInvitationSubject(bankName: string): string {
  return `[${bankName}] You have been invited to AEGIS`;
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
