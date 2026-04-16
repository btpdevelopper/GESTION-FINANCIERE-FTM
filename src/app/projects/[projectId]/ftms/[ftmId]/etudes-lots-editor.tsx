"use client";

import { useState, useTransition, useEffect } from "react";
import { CheckCircle2, RotateCcw, Building2, Clock, FileText } from "lucide-react";
import { saveEtudesAction, addCompanyToFtmAction } from "@/server/ftm/ftm-actions";
import { useRouter } from "next/navigation";

export function EtudesLotsEditor({
  projectId,
  ftmId,
  globalDescription,
  lots,
  concernedOrgs,
  allOrgs,
  isLocked = false,
}: {
  projectId: string;
  ftmId: string;
  globalDescription: string;
  lots: { organizationId: string; descriptionTravaux: string }[];
  concernedOrgs: { organizationId: string; dateLimiteDevis: Date | null; organization: { name: string } }[];
  allOrgs: { id: string; name: string }[];
  isLocked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [desc, setDesc] = useState(globalDescription ?? "");
  const [lotData, setLotData] = useState<Record<string, { descriptionTravaux: string; expectedResponseDate: string }>>({});

  useEffect(() => {
    setLotData(prev => {
      const next = { ...prev };
      let changed = false;
      concernedOrgs.forEach((co) => {
        if (!next[co.organizationId]) {
          const matchingLot = lots.find(l => l.organizationId === co.organizationId);
          next[co.organizationId] = {
            descriptionTravaux: matchingLot?.descriptionTravaux ?? "",
            expectedResponseDate: co.dateLimiteDevis ? new Date(co.dateLimiteDevis).toISOString().split("T")[0] : "",
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [concernedOrgs, lots]);

  const availableToAdd = allOrgs.filter(o => !concernedOrgs.some(co => co.organizationId === o.id));

  const handleUpdate = (orgId: string, field: "descriptionTravaux" | "expectedResponseDate", value: string) => {
    if (isLocked) return;
    setLotData(prev => ({
      ...prev,
      [orgId]: { ...prev[orgId], [field]: value }
    }));
  };

  const handleSave = () => {
    if (isLocked) return;
    startTransition(async () => {
      const companyUpdates = Object.entries(lotData).map(([orgId, data]) => ({
        organizationId: orgId,
        descriptionTravaux: data.descriptionTravaux,
        expectedResponseDate: data.expectedResponseDate ? new Date(data.expectedResponseDate) : null,
      }));

      await saveEtudesAction({
        projectId,
        ftmId,
        etudesDescription: desc,
        companyUpdates,
      });
      router.refresh();
    });
  };

  const handleAddCompany = (orgId: string) => {
    if (!orgId || isLocked) return;
    startTransition(async () => {
      await addCompanyToFtmAction({ projectId, ftmId, organizationId: orgId });
      // We don't automatically populate `lotData` here because we rely on Server Component to re-render and pass updated props
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-600" />
          Synthèse globale des études
        </label>
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={isLocked}
          rows={3}
          placeholder="Synthèse de l'aléa global, notes techniques générales..."
          className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-75 disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-slate-100 pt-6 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" />
            Détails et Délais par Entreprise
          </label>
          {availableToAdd.length > 0 && !isLocked && (
            <select
              disabled={pending}
              onChange={(e) => { handleAddCompany(e.target.value); e.target.value = ""; }}
              value=""
              className="h-8 max-w-[200px] text-xs font-medium bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 focus:border-emerald-500 px-2 outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 truncate disabled:opacity-50"
            >
              <option value="" disabled>+ Ajouter entreprise</option>
              {availableToAdd.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {concernedOrgs.map(org => {
            // Note: because `lotData` is seeded in useState once, newly added companies won't be in `lotData` perfectly 
            // until the component unmounts or we write an effect. Wait! Let's do an effect.
            const matchingLot = lots.find(l => l.organizationId === org.organizationId);
            const state = lotData[org.organizationId] || {
              descriptionTravaux: matchingLot?.descriptionTravaux ?? "",
              expectedResponseDate: org.dateLimiteDevis ? new Date(org.dateLimiteDevis).toISOString().split("T")[0] : ""
            };

            return (
              <div key={org.organizationId} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {org.organization.name}
                  </h3>
                </div>
                <div className="flex flex-col xl:flex-row gap-4">
                  <label className="flex-1 flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Description des travaux / directives
                    <textarea
                      value={state.descriptionTravaux}
                      onChange={e => handleUpdate(org.organizationId, "descriptionTravaux", e.target.value)}
                      disabled={isLocked}
                      rows={2}
                      placeholder="Travaux demandés à cette entreprise..."
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-75 disabled:cursor-not-allowed"
                    />
                  </label>
                  <label className="xl:w-64 flex flex-col gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    Date limite de devis
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="date"
                        value={state.expectedResponseDate}
                        disabled={isLocked}
                        onChange={e => handleUpdate(org.organizationId, "expectedResponseDate", e.target.value)}
                        className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                    </div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isLocked && (
        <div>
          <button
            onClick={handleSave}
            disabled={pending}
            className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
          >
            {pending ? <RotateCcw className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Enregistrement..." : "Sauvegarder les études et délais"}
          </button>
        </div>
      )}
    </div>
  );
}
