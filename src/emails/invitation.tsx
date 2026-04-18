import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface InvitationEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  magicLink: string;
}

export function InvitationEmail({ ftmTitle, ftmNumber, magicLink }: InvitationEmailProps) {
  return (
    <BaseLayout preview={`Invitation à contribuer aux études — FTM N°${ftmNumber}`}>
      <Heading style={h1}>Invitation aux études FTM</Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Vous avez été invité(e) à contribuer aux études d'une Fiche de Travaux
        Modificatifs (FTM) sur la plateforme Aurem Gestion Financière.
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>FTM concerné</Text>
        <Text style={infoValue}>
          N°{ftmNumber} — {ftmTitle}
        </Text>
      </Section>

      <Text style={p}>
        Cliquez sur le bouton ci-dessous pour accéder au dossier et saisir votre
        contribution. Ce lien est valide pendant <strong>72 heures</strong>.
      </Text>

      <Section style={buttonSection}>
        <Button href={magicLink} style={buttonStyle}>
          Accéder au dossier →
        </Button>
      </Section>

      <Text style={hint}>
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :{" "}
        <span style={{ color: "#2563eb" }}>{magicLink}</span>
      </Text>
    </BaseLayout>
  );
}

export default InvitationEmail;

// ── Styles ────────────────────────────────────────────────────────────────────
const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
const hint: React.CSSProperties = { color: "#94a3b8", fontSize: "11px", lineHeight: "18px", margin: "16px 0 0", wordBreak: "break-all" as const };
