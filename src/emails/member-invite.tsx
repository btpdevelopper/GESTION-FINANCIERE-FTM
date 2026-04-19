import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface MemberInviteEmailProps {
  inviteLink: string;
  projectName: string;
  recipientName?: string;
}

export function MemberInviteEmail({
  inviteLink,
  projectName,
  recipientName,
}: MemberInviteEmailProps) {
  return (
    <BaseLayout preview={`Invitation à rejoindre le projet ${projectName}`}>
      <Heading style={h1}>Vous avez été invité(e)</Heading>
      <Text style={p}>
        {recipientName ? `Bonjour ${recipientName},` : "Bonjour,"}
      </Text>
      <Text style={p}>
        Vous avez été ajouté(e) en tant que membre du projet suivant sur la
        plateforme <strong>Aurem Gestion Financière</strong> :
      </Text>

      <Section style={infoBox}>
        <Text style={infoLabel}>Projet</Text>
        <Text style={infoValue}>{projectName}</Text>
      </Section>

      <Text style={p}>
        Cliquez sur le bouton ci-dessous pour définir votre mot de passe et
        accéder à la plateforme.
      </Text>

      <Section style={buttonSection}>
        <Button href={inviteLink} style={buttonStyle}>
          Définir mon mot de passe →
        </Button>
      </Section>

      <Text style={hint}>
        Ce lien est valide pendant <strong>24 heures</strong>. Si le bouton ne
        fonctionne pas, copiez cette adresse dans votre navigateur :{" "}
        <span style={{ color: "#2563eb" }}>{inviteLink}</span>
      </Text>

      <Text style={p}>
        Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email
        en toute sécurité.
      </Text>
    </BaseLayout>
  );
}

export default MemberInviteEmail;

// ── Styles ────────────────────────────────────────────────────────────────────
const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const infoLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { color: "#0f2744", fontSize: "15px", fontWeight: "600", margin: "0" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
const hint: React.CSSProperties = { color: "#94a3b8", fontSize: "11px", lineHeight: "18px", margin: "16px 0 0", wordBreak: "break-all" as const };
