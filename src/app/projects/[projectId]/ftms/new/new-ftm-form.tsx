"use client";

import { useState } from "react";
import { ProjectRole, ModificationSource } from "@prisma/client";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { createFtmAction, createFtmDemandAction, updateFtmDemandDraftAction, deleteDemandDocumentAction, rejectFtmDemandAction } from "@/server/ftm/ftm-actions";
import { 
  Building2, FileText, ChevronRight, Plus, X, 
  UploadCloud, Paperclip, CheckCircle2, AlertCircle, Loader2 
} from "lucide-react";

type Props = {
  projectId: string;
  role: ProjectRole;
  userOrgId: string;
  orgs: { id: string; name: string }[];
  demandId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialDate?: string;
  initialFiles?: { id: string; name: string }[];
  demandStatus?: string;
};

export function NewFtmForm({ projectId, role, userOrgId, orgs, demandId, initialTitle, initialDescription, initialDate, initialFiles, demandStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // General Status
  const isCompany = role === ProjectRole.ENTREPRISE;
  const isTerminalDemand = demandStatus === "APPROVED" || demandStatus === "REJECTED";
  const isLocked = isTerminalDemand || (isCompany && demandStatus !== undefined && demandStatus !== "DRAFT");

  // Block 1: Info Générales
  const [title, setTitle] = useState(initialTitle || "");
  const [modificationSource, setModificationSource] = useState<"MOA" | "MOE" | "ALEAS_EXECUTION">("MOE");

  // Block 2: Entreprises (MOE/MOA only)
  type LotState = { descriptionTravaux: string; expectedResponseDate: string };
  const [selectedOrgs, setSelectedOrgs] = useState<Record<string, LotState>>({});
  
  // Block 2b: Entreprise Specific (Only if role === ENTREPRISE)
  const [globalDescription, setGlobalDescription] = useState(initialDescription || "");
  const [requestedMoeResponseDate, setRequestedMoeResponseDate] = useState(initialDate || "");

  // Block 3: Documents
  const [files, setFiles] = useState<{ file: File; organizationId: string | null }[]>([]);
  const [savedFiles, setSavedFiles] = useState(initialFiles || []);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRemoveSavedFile = async (docId: string) => {
    if (!demandId) return;
    try {
      setDeletingId(docId);
      setError(null);
      await deleteDemandDocumentAction({ projectId, demandId, documentId: docId });
      setSavedFiles(prev => prev.filter(f => f.id !== docId));
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleReject = async () => {
    if (!demandId) return;
    if (!window.confirm("Voulez-vous vraiment refuser cette demande de l'entreprise ?")) return;
    setLoading(true);
    try {
      await rejectFtmDemandAction(projectId, demandId);
      router.push(`/projects/${projectId}/ftms?tab=demandes`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Helpers
  const handleAddOrg = (orgId: string) => {
    if (!orgId || selectedOrgs[orgId]) return;
    setSelectedOrgs(prev => ({
      ...prev,
      [orgId]: { descriptionTravaux: "", expectedResponseDate: "" }
    }));
  };

  const handleRemoveOrg = (orgId: string) => {
    setSelectedOrgs(prev => {
      const next = { ...prev };
      delete next[orgId];
      return next;
    });
  };

  const updateLot = (orgId: string, field: keyof LotState, value: string) => {
    setSelectedOrgs(prev => ({
      ...prev,
      [orgId]: { ...prev[orgId], [field]: value }
    }));
  };

  const handleSubmit = async (e: React.FormEvent, isDraftAction: boolean = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!title.trim()) throw new Error("Le titre est requis.");

      let finalLots: any[] = [];
      let finalSource: "MOA" | "MOE" | "ALEAS_EXECUTION" = "ALEAS_EXECUTION";
      let finalRequestedDate = null;
      let finalCompanyDescription = null;

      if (isCompany) {
        if (!isDraftAction && !globalDescription.trim()) throw new Error("La description est requise pour soumettre.");
        if (!isDraftAction && !requestedMoeResponseDate) throw new Error("La date de retour souhaitée est requise pour soumettre.");
        if (requestedMoeResponseDate) finalRequestedDate = new Date(requestedMoeResponseDate).toISOString();
        finalCompanyDescription = globalDescription;
        finalLots = [{
          organizationId: userOrgId,
          descriptionTravaux: "",
        }];
      } else {
        finalSource = modificationSource;
        const orgIds = Object.keys(selectedOrgs);
        if (orgIds.length === 0) throw new Error("Veuillez ajouter au moins une entreprise concernée.");

        for (const orgId of orgIds) {
          finalLots.push({
            organizationId: orgId,
            descriptionTravaux: "",
            expectedResponseDate: null,
          });
        }
      }

      const fd = new FormData();
      const payload = {
        projectId,
        title,
        modificationSource: finalSource,
        fromDemandId: demandId || undefined,
        lots: finalLots,
        documentsMeta: files.map(f => ({
          fileKey: f.file.name,
          organizationId: f.organizationId || null
        }))
      };
      
      fd.append("payload", JSON.stringify(payload));
      for (const f of files) {
        fd.append("files", f.file);
      }

      if (isCompany) {
         const demandPayload = {
            demandId: demandId || undefined,
            projectId,
            title,
            description: finalCompanyDescription,
            requestedMoeResponseDate: finalRequestedDate,
            isDraft: isDraftAction,
            documentsMeta: files.map(f => ({ fileKey: f.file.name, organizationId: null }))
         };
         fd.delete("payload");
         fd.append("payload", JSON.stringify(demandPayload));
         if (demandId) {
            const res = await updateFtmDemandDraftAction(fd);
            router.push(`/projects/${projectId}/ftms?tab=demandes`);
         } else {
            const res = await createFtmDemandAction(fd);
            router.push(`/projects/${projectId}/ftms?tab=demandes`);
         }
      } else {
         const res = await createFtmAction(fd);
         router.push(`/projects/${projectId}/ftms/${res.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const availableOrgsToAdd = orgs.filter(o => !selectedOrgs[o.id]);

  return (
    <form className="flex flex-col gap-8 pb-12">
      {error && (
        <div className="flex px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm gap-2">
           <AlertCircle className="w-5 h-5 flex-shrink-0" />
           {error}
        </div>
      )}

      {/* Block 1: Identité */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
        <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 dark:bg-slate-800/80 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
            Signification et Titre
          </h2>
        </div>
        <div className="p-5 flex flex-col md:flex-row gap-5">
           <label className="flex-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
              Titre explicatif du FTM
              <input
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={isLocked}
                readOnly={isLocked}
                className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${isLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                placeholder="Ex: Refonte du lot menuiserie RDC suite aux aléas de terrain..."
              />
           </label>
           
           {!isCompany && (
             <label className="md:w-64 flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Source de la demande
                <select
                  value={modificationSource}
                  onChange={e => setModificationSource(e.target.value as any)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="MOE">MOE</option>
                  <option value="MOA">MOA</option>
                  <option value="ALEAS_EXECUTION">Aléas d&apos;exécution</option>
                </select>
             </label>
           )}
        </div>
      </div>

      {/* Block 2: Lots & Enterprises */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
        <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 dark:bg-slate-800/80 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
            {isCompany ? "Détails de la demande" : "Entreprises ciblées"}
          </h2>
          {!isCompany && availableOrgsToAdd.length > 0 && (
             <div className="flex items-center gap-2">
                <select 
                   onChange={(e) => { handleAddOrg(e.target.value); e.target.value = ""; }} 
                   value="" 
                   className="h-8 max-w-[200px] text-xs font-medium bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50 focus:border-emerald-500 px-2 outline-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 truncate"
                >
                   <option value="" disabled>+ Ajouter entreprise</option>
                   {availableOrgsToAdd.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
             </div>
          )}
        </div>
        
        <div className="p-5 bg-slate-50/30 dark:bg-slate-900/40">
          {isCompany ? (
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                Description des aléas / travaux (Votre lot)
                <textarea
                  required
                  rows={4}
                  value={globalDescription}
                  onChange={e => setGlobalDescription(e.target.value)}
                  disabled={isLocked}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 md:w-64">
                Date de réponse MOE souhaitée
                <input
                  required
                  type="date"
                  value={requestedMoeResponseDate}
                  onChange={e => setRequestedMoeResponseDate(e.target.value)}
                  disabled={isLocked}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-900 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </label>
            </div>
          ) : (
             <div className="flex flex-col gap-4">
                {Object.keys(selectedOrgs).length === 0 && (
                   <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 dark:border-slate-800">
                      <Plus className="w-6 h-6 mb-2 text-slate-300" />
                      <p className="text-sm font-medium">Aucune entreprise ciblée</p>
                      <p className="text-xs">Utilisez le menu déroulant en haut à droite pour ajouter des lots à ce FTM.</p>
                   </div>
                )}
                {Object.keys(selectedOrgs).map(orgId => {
                  const org = orgs.find(o => o.id === orgId);
                  const lot = selectedOrgs[orgId];
                  if (!org) return null;
                  
                  return (
                     <div key={org.id} className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex justify-between items-start mb-3">
                           <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              {org.name}
                           </h3>
                           <button 
                             type="button" 
                             onClick={() => handleRemoveOrg(org.id)}
                             className="text-slate-400 hover:text-red-500 transition-colors p-1"
                             title="Retirer cette entreprise"
                           >
                             <X className="w-4 h-4" />
                           </button>
                        </div>
                     </div>
                  );
                })}
             </div>
          )}
        </div>
      </div>

      {/* Block 3: Documents joints */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
        <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 dark:bg-slate-800/80 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
            Documents liés <span className="text-sm font-normal text-slate-500">(Plans, DCE, photos)</span>
          </h2>
        </div>
        
         <div className="p-5 flex flex-col gap-4">
           {savedFiles.length > 0 && (
             <div className="mb-2">
                 <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Fichiers sauvegardés (Brouillon)</h3>
                 <div className="flex flex-col gap-2">
                   {savedFiles.map(f => (
                     <div key={f.id} className="flex items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900/50 dark:bg-emerald-900/20">
                        <span className="truncate font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          {f.name}
                        </span>
                        <div className="flex items-center gap-3">
                           <span className="text-xs text-emerald-600 dark:text-emerald-400">Déjà enregistré</span>
                           <button
                             type="button"
                             onClick={() => handleRemoveSavedFile(f.id)}
                             disabled={deletingId === f.id || loading}
                             className="text-emerald-400 hover:text-red-600 transition-colors disabled:opacity-50"
                             title="Supprimer définitivement ce fichier"
                           >
                             {deletingId === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                           </button>
                        </div>
                     </div>
                   ))}
                 </div>
             </div>
           )}
           
           {files.length > 0 && (
             <div className="flex flex-col gap-2">
               {files.map((f, i) => (
                 <div key={i} className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                   <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      {f.file.name}
                   </span>
                   <div className="flex items-center gap-3">
                      {!isCompany && (
                        <select
                          value={f.organizationId || ""}
                          onChange={(e) => {
                            const newFiles = [...files];
                            newFiles[i].organizationId = e.target.value || null;
                            setFiles(newFiles);
                          }}
                          className="max-w-[200px] truncate rounded border border-slate-300 bg-white py-1 px-2 text-xs outline-none dark:border-slate-600 dark:bg-slate-900"
                        >
                          <option value="">Général (Visuel pour tous)</option>
                          {Object.keys(selectedOrgs).map(orgId => {
                            const o = orgs.find(x => x.id === orgId);
                            if (!o) return null;
                            return <option key={o.id} value={o.id}>Spécifique: {o.name}</option>;
                          })}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                   </div>
                 </div>
               ))}
             </div>
           )}

           {!isLocked && (
             <label className="group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-8 transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-900/20">
               <UploadCloud className="mb-3 h-8 w-8 text-slate-400 group-hover:text-emerald-500 transition-colors" />
               <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                 Cliquez pour ajouter des fichiers
              </p>
              <p className="mt-1 text-xs text-slate-500">PDF, Excel, Images (Max 50MB)</p>
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    const arr = Array.from(e.target.files).map(file => ({ file, organizationId: null }));
                    setFiles(prev => [...prev, ...arr]);
                  }
                }}
              />
           </label>
           )}
        </div>
      </div>

      {!isLocked && (
        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
           {isCompany && (
           <button
             type="button"
             onClick={(e) => handleSubmit(e as unknown as React.FormEvent, true)}
             disabled={loading}
             className="flex items-center gap-2 rounded-md bg-slate-100 px-6 py-2.5 text-sm font-medium text-slate-700 transition-opacity hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
           >
             {loading ? "..." : "Enregistrer comme brouillon"}
           </button>
         )}
         {!isCompany && demandId && (
           <button
             type="button"
             onClick={handleReject}
             disabled={loading}
             className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-6 py-2.5 text-sm font-medium text-red-600 transition-opacity hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
           >
             Refuser la demande
           </button>
         )}
         <button
           type="button"
           onClick={(e) => handleSubmit(e as unknown as React.FormEvent, false)}
           disabled={loading || (!isCompany && Object.keys(selectedOrgs).length === 0)}
           className="flex items-center gap-2 rounded-md bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-600 dark:hover:bg-emerald-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
         >
           {loading ? "Création en cours..." : (isCompany ? "Soumettre au MOE" : "Créer le FTM")}
           {!loading && <ChevronRight className="w-4 h-4" />}
         </button>
        </div>
      )}
    </form>
  );
}
