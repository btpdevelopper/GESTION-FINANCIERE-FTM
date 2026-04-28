"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { ReminderConfigModal } from "./reminder-config-modal";

function statusInfo(sub: any) {
  if (!sub) {
    return {
      label: "En attente",
      classes:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  const review = sub.reviews?.[0];
  if (review?.decision === "RESEND_CORRECTION") {
    return {
      label: "A corriger",
      classes:
        "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    };
  }
  if (review?.decision === "DECLINE") {
    return {
      label: "Refusé",
      classes: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
    };
  }
  if (review?.decision === "ACCEPT") {
    return {
      label: "Validé",
      classes:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    };
  }
  return {
    label: "Soumis",
    classes: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
}

function reminderLabel(freq: number | null | undefined): string {
  if (!freq || freq <= 0) return "Désactivés";
  if (freq === 1) return "Tous les jours";
  if (freq === 7) return "Toutes les semaines";
  if (freq === 14) return "Toutes les 2 semaines";
  return `Tous les ${freq} jours`;
}

export function QuoteTrackingDashboard({
  ftm,
  pm,
  latestSubmissions,
  projectId,
}: {
  ftm: any;
  pm: any;
  latestSubmissions: any[];
  projectId: string;
}) {
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  // Only MOE or MOA sees the full dashboard
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    return null;
  }

  const activeOrg = ftm.concernedOrgs.find((o: any) => o.id === activeOrgId) ?? null;
  const activeSub = activeOrg
    ? latestSubmissions.find((s) => s.organizationId === activeOrg.organizationId)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Suivi des devis
        </h3>
        <span className="text-xs text-slate-400">
          {ftm.concernedOrgs.length} entreprise{ftm.concernedOrgs.length > 1 ? "s" : ""} consultée{ftm.concernedOrgs.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2.5 font-medium">Entreprise</th>
              <th className="px-3 py-2.5 font-medium">Statut</th>
              <th className="px-3 py-2.5 font-medium">Indice</th>
              <th className="px-3 py-2.5 font-medium">N° Devis</th>
              <th className="px-3 py-2.5 font-medium">Date soumission</th>
              <th className="px-3 py-2.5 font-medium">Date limite</th>
              <th className="px-3 py-2.5 font-medium">Montant HT</th>
              <th className="px-3 py-2.5 font-medium">Rappels</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {ftm.concernedOrgs.map((org: any) => {
              const sub = latestSubmissions.find(
                (s) => s.organizationId === org.organizationId
              );
              const { label, classes } = statusInfo(sub);
              const freq = org.reminderFrequencyDays ?? null;
              const reminderActive = freq != null && freq > 0;

              return (
                <tr
                  key={org.id}
                  className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-200">
                    {org.organization.name}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${classes}`}
                    >
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                    {sub ? sub.indice : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                    {sub ? (sub.quoteNumber || "—") : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    {sub ? (
                      <div className="flex flex-col gap-1">
                        <span>
                          {new Date(sub.submittedAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {sub.documentUrl && (
                          <a
                            href={`/api/ftm-doc?path=${encodeURIComponent(sub.documentUrl)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-slate-600 underline decoration-slate-300 hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200"
                          >
                            Télécharger le devis
                          </a>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                    {org.dateLimiteDevis
                      ? new Date(org.dateLimiteDevis).toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-200">
                    {sub
                      ? (Number(sub.amountHtCents) / 100).toLocaleString(
                        "fr-FR",
                        { style: "currency", currency: "EUR" }
                      )
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setActiveOrgId(org.id)}
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-medium transition-colors ${
                        reminderActive
                          ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500 dark:hover:bg-slate-800/60"
                      }`}
                      title="Configurer les rappels"
                    >
                      {reminderActive ? (
                        <Bell className="h-3 w-3" />
                      ) : (
                        <BellOff className="h-3 w-3" />
                      )}
                      {reminderLabel(freq)}
                    </button>
                  </td>
                </tr>
              );
            })}
            {ftm.concernedOrgs.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-slate-400"
                >
                  Aucune entreprise consultée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeOrg && (
        <ReminderConfigModal
          open={!!activeOrg}
          onClose={() => setActiveOrgId(null)}
          projectId={projectId}
          ftmId={ftm.id}
          concernedOrgId={activeOrg.id}
          orgName={activeOrg.organization.name}
          initialFreq={activeOrg.reminderFrequencyDays ?? null}
          lastReminderAt={activeOrg.lastReminderAt ?? null}
          dateLimite={activeOrg.dateLimiteDevis ?? null}
          hasSubmitted={!!activeSub}
        />
      )}
    </div>
  );
}
