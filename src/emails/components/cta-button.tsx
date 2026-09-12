import { Section, Link } from "@react-email/components";

interface CtaButtonProps {
  href: string;
  text: string;
}

export function CtaButton({ href, text }: CtaButtonProps) {
  return (
    <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
      <Link href={href} style={buttonStyle}>
        {text}
      </Link>
    </Section>
  );
}

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  padding: "12px 32px",
  borderRadius: "6px",
  textDecoration: "none",
};
