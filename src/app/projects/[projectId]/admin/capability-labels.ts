import { Capability } from "@prisma/client";

export const CAPABILITY_LABELS: Record<Capability, { label: string; description: string }> = {
  VIEW_GLOBAL_FINANCE: {
    label: "Voir les finances globales",
    description: "Accès aux montants et synthèses financières de tout le projet.",
  },
  VIEW_OWN_SCOPE: {
    label: "Voir son périmètre",
    description: "Accès limité aux FTM et lots qui concernent la propre entreprise du membre.",
  },
  CREATE_FTM: {
    label: "Créer une FTM",
    description: "Peut initier un nouveau dossier FTM depuis le projet.",
  },
  APPROVE_FTM_CREATION_MOE: {
    label: "Approuver la création d'une FTM (MOE)",
    description: "Autorise le MOE à valider une demande de FTM initiée par une entreprise.",
  },
  EDIT_ETUDES: {
    label: "Modifier les études",
    description: "Peut créer, modifier et sauvegarder le contenu des études.",
  },
  INVITE_ETUDES_PARTICIPANT: {
    label: "Inviter un participant aux études",
    description: "Peut envoyer un lien magique d'invitation pour contribuer aux études.",
  },
  VALIDATE_ETUDES_MOA: {
    label: "Valider les études (MOA)",
    description: "Autorise le MOA à approuver ou refuser des études soumises.",
  },
  SET_DEADLINES_AFTER_ETUDES: {
    label: "Définir les délais après études",
    description: "Peut fixer les dates limites de remise des devis par entreprise.",
  },
  POST_FTM_CHAT: {
    label: "Écrire dans le chat FTM",
    description: "Peut poster des messages dans le fil de discussion d'une FTM.",
  },
  SUBMIT_QUOTE: {
    label: "Soumettre un devis",
    description: "Une entreprise peut déposer un devis en phase de chiffrage.",
  },
  ANALYZE_QUOTE_MOE: {
    label: "Analyser un devis (MOE)",
    description: "Peut accepter, refuser ou renvoyer un devis en correction.",
  },
  FINAL_VALIDATE_QUOTE_MOA: {
    label: "Validation finale d'un devis (MOA)",
    description: "Décision finale du MOA sur les devis ayant passé l'analyse MOE.",
  },
  ADMIN_PROJECT_PERMISSIONS: {
    label: "Administrer le projet",
    description: "Accès complet à la configuration, au découpage financier et aux permissions.",
  },
  SUBMIT_SITUATION: {
    label: "Soumettre une situation de travaux",
    description: "Une entreprise peut déposer et soumettre une situation d'avancement mensuelle.",
  },
  REVIEW_SITUATION_MOE: {
    label: "Réviser une situation (MOE)",
    description: "Peut approuver, renvoyer en correction ou refuser une situation soumise.",
  },
  VALIDATE_SITUATION_MOA: {
    label: "Valider une situation (MOA)",
    description: "Validation finale du MOA sur les situations approuvées par le MOE.",
  },
  CONFIGURE_CONTRACT_SETTINGS: {
    label: "Configurer les paramètres contractuels",
    description: "Peut définir la retenue de garantie, l'avance travaux et les pénalités par entreprise.",
  },
  SUBMIT_FORECAST: {
    label: "Soumettre un prévisionnel",
    description: "Une entreprise peut créer et soumettre son plan de facturation mensuel.",
  },
  REVIEW_FORECAST_MOE: {
    label: "Réviser un prévisionnel (MOE)",
    description: "Peut approuver, renvoyer en correction ou refuser un prévisionnel soumis, et dispenser une entreprise de prévisionnel.",
  },
  VALIDATE_FORECAST_MOA: {
    label: "Valider un prévisionnel (MOA)",
    description: "Validation finale du MOA sur les prévisionnels approuvés par le MOE.",
  },
};

export function labelForCapability(c: Capability): string {
  return CAPABILITY_LABELS[c]?.label ?? c;
}

export function descriptionForCapability(c: Capability): string {
  return CAPABILITY_LABELS[c]?.description ?? "";
}
