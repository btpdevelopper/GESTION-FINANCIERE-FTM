import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface BaseLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function BaseLayout({ preview, children }: BaseLayoutProps) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerStyle}>
            <Text style={brandStyle}>AUREM</Text>
            <Text style={subBrandStyle}>Gestion Financière</Text>
          </Section>

          {/* Content */}
          <Section style={contentStyle}>{children}</Section>

          {/* Footer */}
          <Hr style={hrStyle} />
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Aurem Gestion Financière — Plateforme de gestion des FTM
            </Text>
            <Text style={footerTextStyle}>
              Cet email a été envoyé automatiquement. Merci de ne pas répondre
              directement à ce message.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f1f5f9",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  margin: "0",
  padding: "32px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  maxWidth: "580px",
  margin: "0 auto",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const headerStyle: React.CSSProperties = {
  backgroundColor: "#0f2744",
  padding: "28px 40px",
};

const brandStyle: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: "800",
  letterSpacing: "4px",
  margin: "0",
  padding: "0",
};

const subBrandStyle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: "2px",
  margin: "2px 0 0 0",
  padding: "0",
  textTransform: "uppercase" as const,
};

const contentStyle: React.CSSProperties = {
  padding: "36px 40px",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "0 40px",
};

const footerStyle: React.CSSProperties = {
  padding: "20px 40px 28px",
};

const footerTextStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "11px",
  lineHeight: "18px",
  margin: "0",
  padding: "0",
};
