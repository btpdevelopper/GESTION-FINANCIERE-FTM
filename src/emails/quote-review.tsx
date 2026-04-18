import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface QuoteReviewEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
  comment: string | null;
  ftmUrl: string;
  isMoaFinal?: boolean; // true when sent after MOA final decision
}

const DECISION_CONFIG = {
  ACCEPT: {
    label: "✓ Devis accepté",
    description: "Votre devis a été accepté. La prochaine étape sera communiquée prochainement.",
    boxStyle: { backgroundColor: "#f0fdf4", border: "1px solid #86efac", color: "#166534" },
  },
  RESEND_CORRECTION: {
    label: "↩ Correction demandée",
    description: "Des corrections sont requises sur votre devis. Veuillez le réviser et le soumettre à nouveau.",
    boxStyle: { backgroundColor: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" },
  },
  DECLINE: {
    label: "✗ Devis refusé",
    description: "Votre devis a été refusé. Votre entreprise ne participe plus à ce FTM.",
    boxStyle: { backgroundColor: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b" },
  },
};

export function QuoteReviewEmail({ ftmTitle, ftmNumber, decision, comment, ftmUrl, isMoaFinal = false }: QuoteReviewEmailProps) {
  const config = DECISION_CONFIG[decision];
  const reviewer = isMoaFinal ? "le MOA" : "le MOE";

  return (
    <BaseLayout preview={`${config.label} par ${reviewer} — FTM N°${ftmNumber}`}>
      <Heading style={h1}>
        Retour sur votre devis — {isMoaFinal ? "Décision finale MOA" : "Analyse MOE"}
      </Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        {reviewer.charAt(0).toUpperCase() + reviewer.slice(1)} a statué sur votre
        devis pour la Fiche de Travaux Modificatifs suivante :
      </Text>

      <Section style={{ ...decisionBox, ...config.boxStyle }}>
        <Text style={decisionLabel}>Décision</Text>
        <Text style={decisionValue}>{config.label}</Text>
        <Text style={{ ...infoValue, marginTop: "8px" }}>N°{ftmNumber} — {ftmTitle}</Text>
      </Section>

      <Text style={p}>{config.description}</Text>

      {comment && (
        <Section style={commentBox}>
          <Text style={commentLabel}>Commentaire</Text>
          <Text style={commentText}>{comment}</Text>
        </Section>
      )}

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={decision === "RESEND_CORRECTION" ? correctionButtonStyle : buttonStyle}>
          {decision === "RESEND_CORRECTION" ? "Soumettre la correction →" : "Consulter le FTM →"}
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default QuoteReviewEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const decisionBox: React.CSSProperties = { borderRadius: "6px", padding: "16px 20px", margin: "20px 0" };
const decisionLabel: React.CSSProperties = { fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const decisionValue: React.CSSProperties = { fontSize: "16px", fontWeight: "700", margin: "0" };
const infoValue: React.CSSProperties = { fontSize: "14px", fontWeight: "500", margin: "0" };
const commentBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "16px 0" };
const commentLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 6px", textTransform: "uppercase" as const };
const commentText: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0", whiteSpace: "pre-wrap" as const };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
const correctionButtonStyle: React.CSSProperties = { ...buttonStyle, backgroundColor: "#d97706" };
