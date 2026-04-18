import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface DemandSubmittedEmailProps {
  demandTitle: string;
  companyName: string;
  requestedDate: string | null;
  demandUrl: string;
}

export function DemandSubmittedEmail({ demandTitle, companyName, requestedDate, demandUrl }: DemandSubmittedEmailProps) {
  return (
    <BaseLayout preview={`Nouvelle demande FTM de ${companyName}`}>
      <Heading style={h1}>Nouvelle demande FTM reçue</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Une nouvelle demande de Fiche de Travaux Modificatifs a été soumise par
        une entreprise. Elle est en attente de votre examen.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Titre de la demande</Text>
        <Text style={infoValue}>{demandTitle}</Text>

        <Text style={{ ...infoLabel, marginTop: "14px" }}>Entreprise demandeuse</Text>
        <Text style={infoValue}>{companyName}</Text>

        {requestedDate && (
          <>
            <Text style={{ ...infoLabel, marginTop: "14px" }}>Date de réponse souhaitée</Text>
            <Text style={infoValue}>{requestedDate}</Text>
          </>
        )}
      </Section>

      <Section style={buttonSection}>
        <Button href={demandUrl} style={buttonStyle}>
          Examiner la demande →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default DemandSubmittedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
