"use client";

import { ProjectRole } from "@prisma/client";

type QuoteSub = {
  id: string;
  indice: number;
  quoteNumber: string | null;
  amountHtCents: bigint | number;
  documentUrl?: string | null;
  organizationId: string;
  submittedAt: string | Date;
  organization: { name: string };
  ftmLot: { lotLabel?: string | null; descriptionTravaux: string };
  reviews: {
    id: string;
    context: string;
    decision: string;
    comment: string;
    decidedAt: string | Date;
    reviewer: {
      user: { name?: string | null; email: string };
      organization: { name: string };
    };
  }[];
};

function decisionLabel(d: string): string {
  switch (d) {
    case "ACCEPT":
      return "Accepté";
    case "DECLINE":
      return "Refusé";
    case "RESEND_CORRECTION":
      return "Renvoyé";
    default:
      return d;
  }
}

function decisionClasses(d: string): string {
  switch (d) {
    case "ACCEPT":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400";
    case "DECLINE":
      return "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400";
    case "RESEND_CORRECTION":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function contextLabel(c: string): string {
  switch (c) {
    case "MOE_ANALYSIS":
      return "Avis MOE";
    case "MOA_FINAL_QUOTE":
      return "Avis MOA";
    default:
      return c;
  }
}

export function FtmQuoteHistory({
  quoteSubmissions,
  pm,
}: {
  quoteSubmissions: QuoteSub[];
  pm: { role: string; organizationId: string };
}) {
  if (quoteSubmissions.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        Aucun devis soumis.
      </p>
    );
  }

  // Group submissions by organization
  const byOrg = new Map<string, QuoteSub[]>();
  for (const q of quoteSubmissions) {
    const key = q.organization.name;
    if (!byOrg.has(key)) byOrg.set(key, []);
    byOrg.get(key)!.push(q);
  }

  return (
    <div className="flex flex-col gap-5">
      {Array.from(byOrg.entries()).map(([orgName, subs]) => (
        <div key={orgName}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {orgName}
          </h4>
          <div className="flex flex-col gap-2">
            {subs.map((q) => (
              <div
                key={q.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950"
              >
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Ind. {q.indice} {q.quoteNumber ? `• N° ${q.quoteNumber}` : ""}
                    </span>
                    {q.ftmLot.lotLabel && (
                      <span className="text-xs text-slate-400">
                        {q.ftmLot.lotLabel}
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {pm.role === ProjectRole.ENTREPRISE && pm.organizationId !== q.organizationId ? (
                      <span className="text-slate-400 italic">Confidentiel</span>
                    ) : (
                      (Number(q.amountHtCents) / 100).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })
                    )}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <div>
                    Soumis le{" "}
                    {new Date(q.submittedAt).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                  {q.documentUrl && (
                    <a
                      href={`/api/ftm-doc?path=${encodeURIComponent(q.documentUrl)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-slate-600 underline decoration-slate-300 hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200"
                    >
                      Télécharger (Ind. {q.indice})
                    </a>
                  )}
                </div>

                {/* Reviews */}
                {pm.role === ProjectRole.ENTREPRISE && pm.organizationId !== q.organizationId ? (
                  <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ Devis transmis
                    </div>
                  </div>
                ) : (
                  <>
                    {q.reviews.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                        {q.reviews.map((r) => (
                          <div key={r.id} className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-slate-500">
                                {contextLabel(r.context)}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${decisionClasses(r.decision)}`}
                              >
                                {decisionLabel(r.decision)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {r.reviewer.user.name ?? r.reviewer.user.email}
                              </span>
                              {r.comment ? ` — ${r.comment}` : null}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.reviews.length === 0 && (
                      <div className="mt-1 text-xs text-slate-400">
                        En attente d'avis
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
