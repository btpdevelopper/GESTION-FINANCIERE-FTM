import { Inngest } from "inngest";

// ── Typed event map ───────────────────────────────────────────────────────────
// Exported as a plain TypeScript type — Inngest v3 uses inference rather than
// the removed `EventSchemas` class from v2.
export type FtmEvents = {
  /** Guest invited to contribute to FTM études via magic link */
  "ftm/invitation.created": {
    data: {
      toEmail: string;
      token: string;
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
    };
  };

  /** MOE saved études for the first time → MOA needs to validate */
  "ftm/etudes.submitted": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
    };
  };

  /** MOA approved or rejected the études → notify MOE */
  "ftm/etudes.decided": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
      decision: "APPROVED" | "DECLINED";
      comment: string | null;
    };
  };

  /** Quoting phase has been opened → notify all concerned companies */
  "ftm/quoting.opened": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
    };
  };

  /** A company submitted a quote → notify all MOE members */
  "ftm/quote.submitted": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
      companyName: string;
      /** BigInt serialised as string to survive JSON serialisation */
      amountHtCents: string;
      submittedAt: string; // ISO 8601
    };
  };

  /** MOE reviewed a company quote (accept / correction / decline) */
  "ftm/quote.reviewed": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
      organizationId: string;
      decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
      comment: string | null;
    };
  };

  /** MOA issued the final decision on a quote */
  "ftm/quote.moa-final": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
      organizationId: string;
      decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
      comment: string | null;
    };
  };

  /** FTM was cancelled by MOE/MOA → notify all concerned companies */
  "ftm/cancelled": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
      reason: string;
    };
  };

  /** FTM reached fully accepted state → notify MOE + MOA + all companies */
  "ftm/accepted": {
    data: {
      projectId: string;
      ftmId: string;
      ftmTitle: string;
      ftmNumber: number;
    };
  };

  /** Company submitted a demand (non-draft) → notify all MOE members */
  "ftm/demand.submitted": {
    data: {
      projectId: string;
      demandId: string;
      demandTitle: string;
      companyName: string;
      requestedDate: string | null; // ISO 8601 or null
    };
  };

  /** MOE rejected a company demand → notify the demanding company */
  "ftm/demand.rejected": {
    data: {
      projectId: string;
      demandId: string;
      demandTitle: string;
      /** Used to resolve the demanding company's members */
      initiatorProjectMemberId: string;
    };
  };
};

export type DgdEvents = {
  /** ENTREPRISE submitted DGD draft → notify MOE members */
  "dgd/submitted": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      organizationName: string;
      soldeDgdHtCents: string;
    };
  };

  /** MOE reviewed DGD (ACCEPT/MODIFY/REJECT) → notify MOA or ENTREPRISE */
  "dgd/moe-reviewed": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      decision: "ACCEPT" | "MODIFY" | "REJECT";
      comment: string;
    };
  };

  /** MOA approved DGD → notify ENTREPRISE, dispute window open */
  "dgd/approved": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      disputeDeadline: string; // ISO 8601
    };
  };

  /** MOA rejected DGD → notify MOE for re-analysis */
  "dgd/moa-rejected": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      comment: string;
    };
  };

  /** ENTREPRISE contested DGD → notify MOE + MOA */
  "dgd/disputed": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      justification: string;
    };
  };

  /** MOE/MOA resolved dispute amicably → notify all parties */
  "dgd/resolved-amicably": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      adjustedSoldeHtCents: string;
    };
  };

  /** MOA declared litigation → notify ENTREPRISE + MOE */
  "dgd/in-litigation": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      comment: string;
    };
  };

  /** MOA recorded court ruling → notify all parties */
  "dgd/resolved-by-court": {
    data: {
      projectId: string;
      dgdId: string;
      organizationId: string;
      courtSoldeHtCents: string;
    };
  };
};

export type SituationEvents = {
  /** ENTREPRISE submitted a situation → notify MOE */
  "situation/submitted": {
    data: {
      projectId: string;
      situationId: string;
      organizationId: string;
      organizationName: string;
      periodLabel: string;
      numero: number;
    };
  };

  /** MOE reviewed a situation (APPROVED / CORRECTION_NEEDED / REFUSED) → notify MOA or ENTREPRISE */
  "situation/moe-reviewed": {
    data: {
      projectId: string;
      situationId: string;
      organizationId: string;
      numero: number;
      decision: "APPROVED" | "CORRECTION_NEEDED" | "REFUSED";
      comment: string | null;
    };
  };

  /** MOA validated a situation (APPROVED / CORRECTION_NEEDED / REFUSED) → notify ENTREPRISE (+ MOE for APPROVED/CORRECTION) */
  "situation/moa-validated": {
    data: {
      projectId: string;
      situationId: string;
      organizationId: string;
      numero: number;
      decision: "APPROVED" | "CORRECTION_NEEDED" | "REFUSED";
      comment: string | null;
    };
  };
};

export type ForecastEvents = {
  /** ENTREPRISE submitted a forecast → notify MOE */
  "forecast/submitted": {
    data: {
      projectId: string;
      forecastId: string;
      organizationId: string;
      organizationName: string;
      indice: number;
    };
  };

  /** MOE reviewed a forecast (APPROVED / CORRECTION_NEEDED / REFUSED) → notify MOA or ENTREPRISE */
  "forecast/moe-reviewed": {
    data: {
      projectId: string;
      forecastId: string;
      organizationId: string;
      decision: "APPROVED" | "CORRECTION_NEEDED" | "REFUSED";
      comment: string | null;
    };
  };

  /** MOA validated a forecast (APPROVED / CORRECTION_NEEDED / REFUSED) → notify ENTREPRISE (+ MOE for APPROVED/CORRECTION) */
  "forecast/moa-validated": {
    data: {
      projectId: string;
      forecastId: string;
      organizationId: string;
      decision: "APPROVED" | "CORRECTION_NEEDED" | "REFUSED";
      comment: string | null;
    };
  };
};

export type PenaltyEvents = {
  /** MOE submitted a penalty for MOA approval */
  "penalty/submitted": {
    data: {
      projectId: string;
      penaltyId: string;
      label: string;
      organizationId: string;
      frozenAmountCents: string; // BigInt serialised as string
    };
  };

  /** MOA approved a penalty → notify MOE + company */
  "penalty/moa-approved": {
    data: {
      projectId: string;
      penaltyId: string;
      label: string;
      organizationId: string;
      frozenAmountCents: string;
    };
  };

  /** MOA refused a penalty → notify MOE */
  "penalty/moa-refused": {
    data: {
      projectId: string;
      penaltyId: string;
      label: string;
      organizationId: string;
    };
  };

  /** Company contested a penalty → notify MOE + MOA */
  "penalty/contested": {
    data: {
      projectId: string;
      penaltyId: string;
      label: string;
      organizationId: string;
      justification: string;
    };
  };
};

export const inngest = new Inngest({
  id: "aurem-gestion-financiere",
  isDev: process.env.NODE_ENV === "development",
});
