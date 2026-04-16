"use client";

import React from "react";
import { Clock, FileText, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { MoaEtudesDecision, FtmPhase } from "@prisma/client";

export function EntrepriseEtudesDashboard({
  ftm,
  myLot,
  projectId
}: {
  ftm: any;
  myLot: any;
  projectId: string;
}) {
  const isPastEtudes = ftm.phase !== FtmPhase.ETUDES;
  const isEtudesApproved = ftm.moaEtudesDecision === MoaEtudesDecision.APPROVED;
  const hasDescription = !!ftm.etudesDescription;
  
  // Safe extraction of the company's own data since backend is strictly constrained
  const companyData = ftm.concernedOrgs?.[0];
  const deadlineDate = companyData?.dateLimiteDevis ? new Date(companyData.dateLimiteDevis) : null;

  // Render Documents
  const renderDocs = () => {
    if (!ftm.documents || ftm.documents.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-500 italic">
          <FileText className="h-4 w-4" />
          Aucun document technique joint pour le moment.
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {ftm.documents.map((doc: any) => (
          <div key={doc.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                <FileText className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{doc.name}</span>
                <span className="text-xs text-slate-400">
                  {new Date(doc.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              </div>
            </div>
            <a
              href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Télécharger
            </a>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* ── MASSIVE DEADLINE WIDGET ── */}
      {isPastEtudes && deadlineDate && (
        <div className="flex flex-col overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900/50 dark:bg-indigo-950/20 shadow-sm relative">
          <div className="absolute top-0 right-0 h-full w-32 opacity-10 pointer-events-none flex items-center justify-center">
            <Clock className="w-48 h-48 text-indigo-500 translate-x-10" />
          </div>
          <div className="p-6 relative z-10 flex flex-col gap-1">
            <h2 className="text-indigo-800 dark:text-indigo-300 text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Date limite de soumission
            </h2>
            <div className="text-3xl font-black text-indigo-950 dark:text-indigo-100 mt-2">
              {deadlineDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
            <div className="text-indigo-700 dark:text-indigo-400 font-medium text-lg">
              à {deadlineDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION CENTER BANNER ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 flex flex-col gap-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          Priorités d'action
        </h3>
        
        {!isEtudesApproved ? (
          <div className="flex flex-col gap-3 rounded-lg bg-slate-50 p-4 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-medium">
              <AlertCircle className="w-5 h-5 text-slate-400" />
              Instruction en cours par la MOE / MOA
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 pl-7">
              Le dossier technique est en cours d'élaboration. Aucune action n'est requise de votre part pour le moment. Vous serez notifié dès la validation des études.
            </p>
          </div>
        ) : !isPastEtudes ? (
          <div className="flex flex-col gap-3 rounded-lg bg-sky-50 p-4 border border-sky-100 dark:bg-sky-950/20 dark:border-sky-900">
            <div className="flex items-center gap-2 text-sm text-sky-800 dark:text-sky-300 font-bold">
              <AlertCircle className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              Préparation au Chiffrage
            </div>
            <p className="text-sm text-sky-700 dark:text-sky-400 pl-7 leading-relaxed">
              Les études viennent d'être validées. La MOA/MOE va très prochainement ouvrir la phase de devis et définir vos délais. Vous pouvez d'ores et déjà préparer votre chiffrage :
            </p>
            <ul className="pl-7 space-y-2 mt-1">
              <li className="flex items-start gap-2 text-sm text-sky-700 dark:text-sky-400">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-sky-500" /> Prendre connaissance de la description technique
              </li>
              <li className="flex items-start gap-2 text-sm text-sky-700 dark:text-sky-400">
                <CheckCircle2 className="w-4 h-4 mt-0.5 text-sky-500" /> Analyser les pièces jointes
              </li>
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg bg-emerald-50 p-4 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900">
            <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300 font-bold">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Phase de chiffrage ouverte
            </div>
            <p className="text-sm text-emerald-700 dark:text-emerald-400 pl-7">
              Veuillez déposer votre devis dans l'onglet "Devis" avant la date limite indiquée ci-dessus.
            </p>
          </div>
        )}
      </div>

      {/* ── TECHNICAL REVIEW ── */}
      {isEtudesApproved ? (
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Directives Techniques
            </h3>
            <div className="flex flex-col gap-5">
              {/* Global Description */}
              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Synthèse globale
                </h4>
                {hasDescription ? (
                   <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                     {ftm.etudesDescription}
                   </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Aucune synthèse rédigée pour le moment.</p>
                )}
              </div>

              {/* Lot Specific Description */}
              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                  Vos directives spécifiques
                </h4>
                <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-indigo-900 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                   {myLot?.descriptionTravaux ? (
                     myLot.descriptionTravaux
                   ) : (
                     <span className="italic text-indigo-400 dark:text-indigo-500">En attente de directives spécifiques à votre lot...</span>
                   )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
             <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">
              Pièces Jointes
            </h3>
            {renderDocs()}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <AlertCircle className="h-5 w-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Directives techniques en cours d'élaboration
              </h3>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Les directives techniques et pièces jointes vous seront communiquées une fois les études validées par le MOA.
              </p>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
