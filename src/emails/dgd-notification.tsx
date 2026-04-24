import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface DgdNotificationEmailProps {
  title: string;
  preview: string;
  intro: string;
  details?: { label: string; value: string }[];
  ctaLabel: string;
  ctaUrl: string;
}

export function DgdNotificationEmail({
  title,
  preview,
  intro,
  details,
  ctaLabel,
  ctaUrl,
}: DgdNotificationEmailProps) {
  return (
    <BaseLayout preview={preview}>
      <Heading style={h1}>{title}</Heading>
      <Text style={p}>{intro}</Text>

      {details && details.length > 0 && (
        <Section style={infoBox}>
          {details.map(({ label, value }) => (
            <React.Fragment key={label}>
              <Text style={infoLabel}>{label}</Text>
              <Text style={infoValue}>{value}</Text>
            </React.Fragment>
          ))}
        </Section>
      )}

      <Section style={buttonSection}>
        <Button href={ctaUrl} style={buttonStyle}>
          {ctaLabel} →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default DgdNotificationEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0 0 10px" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
