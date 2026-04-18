import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface ReminderQuoteEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  deadlineDate: string | null;
  ftmUrl: string;
}

export function ReminderQuoteEmail({ ftmTitle, ftmNumber, deadlineDate, ftmUrl }: ReminderQuoteEmailProps) {
  return (
    <BaseLayout preview={`Rappel — Devis en attente pour la FTM N°${ftmNumber}`}>
      <Heading style={h1}>Rappel : Devis en attente</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Ceci est un rappel automatique : votre entreprise n'a pas encore soumis
        de devis pour la Fiche de Travaux Modificatifs suivante.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM en attente de devis</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>
        {deadlineDate && (
          <>
            <Text style={{ ...infoLabel, marginTop: "14px", color: "#92400e" }}>Date limite</Text>
            <Text style={{ ...infoValue, color: "#b45309" }}>{deadlineDate}</Text>
          </>
        )}
      </Section>

      <Text style={p}>
        Merci de soumettre votre devis dès que possible via la plateforme.
      </Text>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Soumettre mon devis →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default ReminderQuoteEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#92400e", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#78350f", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#d97706", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
