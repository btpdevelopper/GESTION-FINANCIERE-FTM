import { Capability, ProjectRole } from "@prisma/client";

export const DEFAULT_GROUP_NAMES: Record<ProjectRole, string> = {
  MOA: "MOA — Défaut",
  MOE: "MOE — Défaut",
  ENTREPRISE: "Entreprise — Défaut",
};

export const DEFAULT_ROLE_CAPABILITIES: Record<ProjectRole, Capability[]> = {
  MOA: [
    Capability.VIEW_GLOBAL_FINANCE,
    Capability.POST_FTM_CHAT,
    Capability.VALIDATE_ETUDES_MOA,
    Capability.FINAL_VALIDATE_QUOTE_MOA,
    Capability.VALIDATE_SITUATION_MOA,
    Capability.VALIDATE_FORECAST_MOA,
    Capability.VALIDATE_PENALTY_MOA,
    Capability.ADMIN_PROJECT_PERMISSIONS,
    Capability.CONFIGURE_CONTRACT_SETTINGS,
    Capability.VALIDATE_DGD_MOA,
  ],
  MOE: [
    Capability.VIEW_GLOBAL_FINANCE,
    Capability.CREATE_FTM,
    Capability.APPROVE_FTM_CREATION_MOE,
    Capability.EDIT_ETUDES,
    Capability.INVITE_ETUDES_PARTICIPANT,
    Capability.SET_DEADLINES_AFTER_ETUDES,
    Capability.POST_FTM_CHAT,
    Capability.ANALYZE_QUOTE_MOE,
    Capability.REVIEW_SITUATION_MOE,
    Capability.REVIEW_FORECAST_MOE,
    Capability.CREATE_PENALTY,
    Capability.REVIEW_DGD_MOE,
  ],
  ENTREPRISE: [
    Capability.VIEW_OWN_SCOPE,
    Capability.SUBMIT_QUOTE,
    Capability.POST_FTM_CHAT,
    Capability.SUBMIT_SITUATION,
    Capability.SUBMIT_FORECAST,
    Capability.CONTEST_PENALTY,
    Capability.SUBMIT_DGD,
    Capability.CONTEST_DGD,
  ],
};
