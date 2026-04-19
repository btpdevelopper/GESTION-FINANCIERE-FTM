import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface PasswordResetEmailProps {
  resetLink: string;
  isFirstConnection?: boolean;
}

export function PasswordResetEmail({
  resetLink,
  isFirstConnection = false,
}: PasswordResetEmailProps) {
  const preview = isFirstConnection
    ? "Définissez votre mot de passe — Aurem Gestion Financière"
    : "Réinitialisez votre mot de passe — Aurem Gestion Financière";

  return (
    <BaseLayout preview={preview}>
      <Heading style={h1}>
        {isFirstConnection
          ? "Définir votre mot de passe"
          : "Réinitialiser votre mot de passe"}
      </Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        {isFirstConnection
          ? "Vous avez demandé à définir un mot de passe pour accéder à la plateforme Aurem Gestion Financière."
          : "Vous avez demandé la réinitialisation du mot de passe de votre compte Aurem Gestion Financière."}
      </Text>

      <Section style={buttonSection}>
        <Button href={resetLink} style={buttonStyle}>
          {isFirstConnection
            ? "Définir mon mot de passe →"
            : "Réinitialiser mon mot de passe →"}
        </Button>
      </Section>

      <Text style={hint}>
        Ce lien est valide pendant <strong>1 heure</strong>. Si le bouton ne
        fonctionne pas, copiez cette adresse dans votre navigateur :{" "}
        <span style={{ color: "#2563eb" }}>{resetLink}</span>
      </Text>

      <Text style={p}>
        Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet
        email — votre mot de passe restera inchangé.
      </Text>
    </BaseLayout>
  );
}

export default PasswordResetEmail;

// ── Styles ────────────────────────────────────────────────────────────────────
const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
const hint: React.CSSProperties = { color: "#94a3b8", fontSize: "11px", lineHeight: "18px", margin: "16px 0 0", wordBreak: "break-all" as const };
