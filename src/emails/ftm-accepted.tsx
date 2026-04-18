import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface FtmAcceptedEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  ftmUrl: string;
}

export function FtmAcceptedEmail({ ftmTitle, ftmNumber, ftmUrl }: FtmAcceptedEmailProps) {
  return (
    <BaseLayout preview={`FTM N°${ftmNumber} finalisé et accepté`}>
      <Heading style={h1}>Fiche de Travaux Modificatifs acceptée ✓</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Nous avons le plaisir de vous informer que la Fiche de Travaux
        Modificatifs suivante a été <strong>entièrement validée et acceptée</strong>.
        Ce dossier est maintenant clôturé.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM clôturé</Text>
        <Text style={infoValue}>N°{ftmNumber} — {ftmTitle}</Text>
        <Text style={infoStatus}>✓ Accepté</Text>
      </Section>

      <Text style={p}>
        Tous les devis ont été analysés et validés. Vous pouvez consulter le
        récapitulatif complet du dossier via le lien ci-dessous.
      </Text>

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Consulter le FTM →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default FtmAcceptedEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#166534", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#14532d", fontSize: "16px", fontWeight: "700", margin: "0" };
const infoStatus: React.CSSProperties = { color: "#16a34a", fontSize: "13px", fontWeight: "600", margin: "8px 0 0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#16a34a", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
