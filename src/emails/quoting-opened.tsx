import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface QuotingOpenedEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  deadlineDate: string | null; // formatted date string or null
  ftmUrl: string;
}

export function QuotingOpenedEmail({ ftmTitle, ftmNumber, deadlineDate, ftmUrl }: QuotingOpenedEmailProps) {
  return (
    <BaseLayout preview={`Phase de chiffrage ouverte — FTM N°${ftmNumber}`}>
      <Heading style={h1}>Phase de chiffrage ouverte</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        La phase de chiffrage a été ouverte pour la Fiche de Travaux
        Modificatifs suivante. Votre entreprise est invitée à soumettre son
        devis via la plateforme.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM concerné</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>
        {deadlineDate && (
          <>
            <Text style={{ ...infoLabel, marginTop: "14px" }}>Date limite de soumission</Text>
            <Text style={{ ...infoValue, color: "#b45309" }}>{deadlineDate}</Text>
          </>
        )}
      </Section>

      <Text style={p}>
        Connectez-vous à la plateforme pour accéder aux directives techniques et
        soumettre votre devis avant la date limite.
      </Text>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Soumettre votre devis →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default QuotingOpenedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
