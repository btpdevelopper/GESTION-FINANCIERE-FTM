import { Button, Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./_components/base-layout";

interface EtudesDecisionEmailProps {
  ftmTitle: string;
  ftmNumber: number;
  decision: "APPROVED" | "DECLINED";
  comment: string | null;
  ftmUrl: string;
}

export function EtudesDecisionEmail({ ftmTitle, ftmNumber, decision, comment, ftmUrl }: EtudesDecisionEmailProps) {
  const isApproved = decision === "APPROVED";

  return (
    <BaseLayout preview={`Études ${isApproved ? "approuvées" : "refusées"} — FTM N°${ftmNumber}`}>
      <Heading style={h1}>
        Études {isApproved ? "approuvées ✓" : "refusées ✗"} par le MOA
      </Heading>
      <Text style={p}>Bonjour,</Text>
      <Text style={p}>
        Le MOA vient de statuer sur les études de la Fiche de Travaux
        Modificatifs suivante :
      </Text>

      <Section style={isApproved ? approvedBox : refusedBox}>
        <Text style={infoLabel}>Décision</Text>
        <Text style={infoValue}>
          {isApproved ? "✓ Approuvé — la phase de chiffrage peut être ouverte." : "✗ Refusé — les études doivent être révisées."}
        </Text>
        <Text style={{ ...infoValue, marginTop: "8px", fontWeight: "600" }}>
          N°{ftmNumber} — {ftmTitle}
        </Text>
      </Section>

      {comment && (
        <Section style={commentBox}>
          <Text style={commentLabel}>Commentaire du MOA</Text>
          <Text style={commentText}>{comment}</Text>
        </Section>
      )}

      <Section style={buttonSection}>
        <Button href={ftmUrl} style={buttonStyle}>
          Consulter le FTM →
        </Button>
      </Section>
    </BaseLayout>
  );
}

export default EtudesDecisionEmail;

const h1: React.CSSProperties = { color: "#0f2744", fontSize: "20px", fontWeight: "700", margin: "0 0 20px" };
const p: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0 0 14px" };
const infoLabel: React.CSSProperties = { fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 4px", textTransform: "uppercase" as const };
const infoValue: React.CSSProperties = { fontSize: "14px", fontWeight: "500", margin: "0" };
const approvedBox: React.CSSProperties = { backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px", padding: "16px 20px", margin: "20px 0", color: "#166534" };
const refusedBox: React.CSSProperties = { backgroundColor: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "6px", padding: "16px 20px", margin: "20px 0", color: "#991b1b" };
const commentBox: React.CSSProperties = { backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "16px 20px", margin: "16px 0" };
const commentLabel: React.CSSProperties = { color: "#64748b", fontSize: "11px", fontWeight: "600", letterSpacing: "0.5px", margin: "0 0 6px", textTransform: "uppercase" as const };
const commentText: React.CSSProperties = { color: "#334155", fontSize: "14px", lineHeight: "22px", margin: "0", whiteSpace: "pre-wrap" as const };
const buttonSection: React.CSSProperties = { margin: "24px 0" };
const buttonStyle: React.CSSProperties = { backgroundColor: "#2563eb", borderRadius: "6px", color: "#ffffff", display: "inline-block", fontSize: "14px", fontWeight: "600", padding: "12px 24px", textDecoration: "none" };
