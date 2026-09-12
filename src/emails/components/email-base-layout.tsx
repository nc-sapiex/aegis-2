import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
  Preview,
  Font,
} from "@react-email/components";

interface EmailBaseLayoutProps {
  bankName: string;
  appUrl: string;
  previewText?: string;
  children: React.ReactNode;
}

export function EmailBaseLayout({
  bankName,
  appUrl,
  previewText,
  children,
}: EmailBaseLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <Font fontFamily="Arial" fallbackFontFamily="Helvetica" />
      </Head>
      {previewText && <Preview>{previewText}</Preview>}
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={logoStyle}>AEGIS</Text>
            <Text style={bankNameStyle}>{bankName}</Text>
          </Section>

          <Hr style={hrStyle} />

          {/* Main Content */}
          <Section style={contentStyle}>{children}</Section>

          <Hr style={hrStyle} />

          {/* Footer */}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              This is an automated notification from AEGIS Audit Platform.
            </Text>
            <Link href={`${appUrl}/settings`} style={footerLinkStyle}>
              Manage notification preferences
            </Link>
            <Text style={confidentialStyle}>
              CONFIDENTIAL — For authorized recipients only. If you received
              this email in error, please delete it immediately and notify the
              sender.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily: "Arial, Helvetica, sans-serif",
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  borderRadius: "8px",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  backgroundColor: "#1e3a5f",
  padding: "24px 32px",
  textAlign: "center" as const,
};

const logoStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "bold",
  letterSpacing: "2px",
  margin: "0 0 4px 0",
};

const bankNameStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "13px",
  margin: 0,
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: 0,
};

const contentStyle: React.CSSProperties = {
  padding: "32px",
};

const footerStyle: React.CSSProperties = {
  padding: "24px 32px",
  textAlign: "center" as const,
};

const footerTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  margin: "0 0 8px 0",
};

const footerLinkStyle: React.CSSProperties = {
  color: "#3b82f6",
  fontSize: "12px",
  textDecoration: "underline",
};

const confidentialStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "10px",
  marginTop: "16px",
  fontStyle: "italic",
};
