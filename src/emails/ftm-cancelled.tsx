import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface FtmCancelledEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  reason: string;
  ftmUrl: string;
}

export function FtmCancelledEmail({ ftmTitle, ftmNumber, reason, ftmUrl }: FtmCancelledEmailProps) {
  return (
    <BaseLayout preview={`FTM N°${ftmNumber} annulé`}>
      <Heading style={h1}>Fiche de Travaux Modificatifs annulée</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Nous vous informons que la Fiche de Travaux Modificatifs suivante a été{" "}
        <strong>annulée</strong> par le MOE ou le MOA. Aucune action
        supplémentaire n'est requise de votre part.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM annulé</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>
        <Text style={{ ...infoLabel, marginTop: "14px" }}>Motif d'annulation</Text>
        <Text style={reasonText}>{reason}</Text>
      </Section>

      <Text style={p}>
        Vous pouvez consulter l'historique complet du dossier sur la plateforme.
      </Text>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Consulter le dossier →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default FtmCancelledEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#991b1b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#7f1d1d", fontSize: "15px", fontWeight: "600", margin: "0" };
const reasonText: React.CSSProperties = { color: "#991b1b", fontSize: "14px", lineHeight: "20px", margin: "0", whiteSpace: "pre-wrap" as const };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#64748b", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
