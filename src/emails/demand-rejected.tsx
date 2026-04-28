import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface DemandRejectedEmailProps {
  demandTitle: string;
  projectUrl: string;
  rejectionComment?: string;
}

export function DemandRejectedEmail({ demandTitle, projectUrl, rejectionComment }: DemandRejectedEmailProps) {
  return (
    <BaseLayout preview={`Votre demande FTM a été refusée`}>
      <Heading style={h1}>Demande FTM refusée</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Nous vous informons que le MOE a examiné votre demande de Fiche de
        Travaux Modificatifs et a décidé de ne pas y donner suite.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Demande refusée</Text>
        <Text style={infoValue}>{demandTitle}</Text>
      </Section>

      {rejectionComment && (
        <Section style={reasonBox}>
          <Text style={reasonLabel}>Motif du refus</Text>
          <Text style={reasonValue}>{rejectionComment}</Text>
        </Section>
      )}

      <Text style={p}>
        Pour toute question complémentaire, veuillez contacter directement le
        MOE du projet.
      </Text>

      <Section style={buttonSection}>
        <Button href={projectUrl} style={buttonStyle}>
          Retour au projet →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default DemandRejectedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#991b1b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#7f1d1d", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#64748b", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
const reasonBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderLeft: "3px solid #ef4444", borderRadius: "4px", padding: "14px 18px", margin: "16px 0" };
const reasonLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 6px", textTransform: "uppercase" as const };
const reasonValue: React.CSSProperties = { color: "#1e293b", fontSize: "14px", lineHeight: "21px", margin: "0", whiteSpace: "pre-wrap" as const };
