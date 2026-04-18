import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface QuoteReceivedEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  companyName: string;
  amountHt: string; // pre-formatted, e.g. "12 500,00 €"
  submittedAt: string; // formatted date
  ftmUrl: string;
}

export function QuoteReceivedEmail({ ftmTitle, ftmNumber, companyName, amountHt, submittedAt, ftmUrl }: QuoteReceivedEmailProps) {
  return (
    <BaseLayout preview={`Nouveau devis reçu de ${companyName} — FTM N°${ftmNumber}`}>
      <Heading style={h1}>Nouveau devis reçu</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Un nouveau devis vient d'être soumis sur la Fiche de Travaux
        Modificatifs suivante et est en attente de votre analyse.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>

        <Text style={{ ...infoLabel, marginTop: "14px" }}>Entreprise</Text>
        <Text style={infoValue}>{companyName}</Text>

        <Text style={{ ...infoLabel, marginTop: "14px" }}>Montant HT</Text>
        <Text style={{ ...infoValue, fontSize: "18px", color: "#1d4ed8" }}>{amountHt}</Text>

        <Text style={{ ...infoLabel, marginTop: "14px" }}>Date de soumission</Text>
        <Text style={infoValue}>{submittedAt}</Text>
      </Section>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Analyser le devis →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default QuoteReceivedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
