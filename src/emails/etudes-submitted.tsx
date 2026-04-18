import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface EtudesSubmittedEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  ftmUrl: string;
}

export function EtudesSubmittedEmail({ ftmTitle, ftmNumber, ftmUrl }: EtudesSubmittedEmailProps) {
  return (
    <BaseLayout preview={`Action requise — Validation des études FTM N°${ftmNumber}`}>
      <Heading style={h1}>Études soumises pour validation</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Le MOE a finalisé et soumis les études pour la Fiche de Travaux
        Modificatifs suivante. Votre validation est requise pour débloquer la
        phase de chiffrage.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM en attente de validation</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Valider les études →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default EtudesSubmittedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#92400e", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#78350f", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
