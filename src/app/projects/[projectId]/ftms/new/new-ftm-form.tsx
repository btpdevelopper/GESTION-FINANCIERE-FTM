"use client";

import { useState } from "react";
import { ProjectRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { createFtmAction } from "@/server/ftm/ftm-actions";

type Props = {
  projectId: string;
  role: ProjectRole;
  userOrgId: string;
  orgs: { id: string; name: string }[];
};

export function NewFtmForm({ projectId, role, userOrgId, orgs }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [modificationSource, setModificationSource] = useState<"MOA" | "MOE" | "ALEAS_EXECUTION">("MOE");
  
  // ENTREPRISE specific
  const [globalDescription, setGlobalDescription] = useState("");
  const [requestedMoeResponseDate, setRequestedMoeResponseDate] = useState("");

  // MOE / MOA specific: selected lots
  const [selectedOrgs, setSelectedOrgs] = useState<Record<string, { descriptionTravaux: string; expectedResponseDate: string }>>({});

  // Documents
  const [files, setFiles] = useState<{ file: File; organizationId: string | null }[]>([]);

  const isCompany = role === ProjectRole.ENTREPRISE;

  const handleToggleOrg = (orgId: string) => {
    setSelectedOrgs(prev => {
      const next = { ...prev };
      if (next[orgId]) {
        delete next[orgId];
      } else {
        next[orgId] = { descriptionTravaux: "", expectedResponseDate: "" };
      }
      return next;
    });
  };

  const updateLot = (orgId: string, field: "descriptionTravaux" | "expectedResponseDate", value: string) => {
    setSelectedOrgs(prev => ({
      ...prev,
      [orgId]: { ...prev[orgId], [field]: value }
    }));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return [];
    const supabase = createClient();
    const uploadedDocs: { name: string; url: string; organizationId: string | null }[] = [];

    for (const { file, organizationId } of files) {
      const ext = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${ext}`;
      const filePath = `${projectId}/${fileName}`;
      
      const { data, error } = await supabase.storage
        .from("ftm-documents")
        .upload(filePath, file);

      if (error) {
        throw new Error(`Erreur upload fichier: ${error.message} (Avez-vous créé le bucket "ftm-documents" public sur Supabase?)`);
      }

      // Public URL
      const { data: publicUrlData } = supabase.storage
        .from("ftm-documents")
        .getPublicUrl(filePath);

      // if not public, you need signed URL, but here we assume it's public or we'll rely on the DB records anyway to secure it if we build an API endpoint.
      // Next js can secure files via signed routes, but MVP using public bucket or just keeping the URL stored.
      uploadedDocs.push({
        name: file.name,
        url: publicUrlData.publicUrl,
        organizationId: organizationId || null,
      });
    }

    return uploadedDocs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!title.trim()) throw new Error("Le titre est requis.");

      // For ENTREPRISE:
      let finalLots: any[] = [];
      let finalSource: "MOA" | "MOE" | "ALEAS_EXECUTION" = "ALEAS_EXECUTION";
      let finalRequestedDate = null;
      let finalDoc = [];

      if (isCompany) {
        if (!globalDescription.trim()) throw new Error("La description est requise.");
        if (!requestedMoeResponseDate) throw new Error("La date de retour souhaitée est requise.");
        
        finalRequestedDate = new Date(requestedMoeResponseDate);
        finalLots = [{
          organizationId: userOrgId,
          descriptionTravaux: globalDescription,
        }];
        finalDoc = await uploadFiles();
      } else {
        // MOE / MOA
        finalSource = modificationSource;
        const orgIds = Object.keys(selectedOrgs);
        if (orgIds.length === 0) throw new Error("Veuillez sélectionner au moins une entreprise.");

        for (const orgId of orgIds) {
          const l = selectedOrgs[orgId];
          if (!l.descriptionTravaux.trim()) {
            throw new Error(`Description requise pour l'entreprise sélectionnée.`);
          }
          finalLots.push({
            organizationId: orgId,
            descriptionTravaux: l.descriptionTravaux,
            expectedResponseDate: l.expectedResponseDate ? new Date(l.expectedResponseDate) : null,
          });
        }
        finalDoc = await uploadFiles();
      }

      const res = await createFtmAction({
        projectId,
        title,
        modificationSource: finalSource,
        lots: finalLots,
        requestedMoeResponseDate: finalRequestedDate,
        documents: finalDoc,
      });

      router.push(`/projects/${projectId}/ftms/${res.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <div className="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Titre
        <input
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
          placeholder={"Ex: Modification menuiseries RDC"}
        />
      </label>

      {isCompany ? (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Description des aléas / travaux
            <textarea
              required
              rows={4}
              value={globalDescription}
              onChange={e => setGlobalDescription(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Date de réponse souhaitée de la MOE
            <input
              required
              type="date"
              value={requestedMoeResponseDate}
              onChange={e => setRequestedMoeResponseDate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Source de la modification
            <select
              value={modificationSource}
              onChange={e => setModificationSource(e.target.value as any)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="MOE">MOE</option>
              <option value="MOA">MOA</option>
              <option value="ALEAS_EXECUTION">Aléas d&apos;exécution</option>
            </select>
          </label>

          <fieldset className="text-sm">
            <legend className="mb-3 font-medium">Entreprises concernées et impacts</legend>
            <div className="space-y-4">
              {orgs.map((o) => (
                <div key={o.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <label className="flex items-center gap-2 font-medium">
                    <input 
                      type="checkbox" 
                      checked={!!selectedOrgs[o.id]}
                      onChange={() => handleToggleOrg(o.id)}
                    />
                    {o.name}
                  </label>
                  
                  {selectedOrgs[o.id] && (
                    <div className="mt-4 flex flex-col gap-4 pl-6">
                      <label className="flex flex-col gap-1 text-sm">
                        Description des travaux pour ce lot
                        <textarea
                          required
                          rows={2}
                          value={selectedOrgs[o.id].descriptionTravaux}
                          onChange={e => updateLot(o.id, "descriptionTravaux", e.target.value)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm w-max">
                        Date limite de remise du devis
                        <input
                          type="date"
                          value={selectedOrgs[o.id].expectedResponseDate}
                          onChange={e => updateLot(o.id, "expectedResponseDate", e.target.value)}
                          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-600 dark:bg-slate-900"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
              {orgs.length === 0 && (
                <p className="text-slate-500">Aucune entreprise sur ce projet.</p>
              )}
            </div>
          </fieldset>
        </>
      )}

      <fieldset className="text-sm">
        <legend className="mb-2 font-medium">Documents joints (Plans, photos, etc.)</legend>
        <div className="flex flex-col gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-4 rounded bg-slate-50 px-3 py-2 dark:bg-slate-800">
              <span className="flex-1 truncate">{f.file.name}</span>
              {!isCompany && (
                <select
                  value={f.organizationId || ""}
                  onChange={(e) => {
                    const newFiles = [...files];
                    newFiles[i].organizationId = e.target.value || null;
                    setFiles(newFiles);
                  }}
                  className="rounded border border-slate-300 py-1 px-2 text-xs"
                >
                  <option value="">Général (Toutes les entreprises)</option>
                  {Object.keys(selectedOrgs).map(orgId => {
                    const o = orgs.find(x => x.id === orgId);
                    if (!o) return null;
                    return <option key={o.id} value={o.id}>Spécifique à {o.name}</option>;
                  })}
                </select>
              )}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                className="text-red-500 hover:text-red-700"
              >
                Retirer
              </button>
            </div>
          ))}
          
          <label className="inline-flex w-max cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            <span>Sélectionner un fichier</span>
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
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {loading ? "Création en cours..." : "Créer le FTM"}
      </button>
    </form>
  );
}
