"use client";

import { useState, useTransition } from "react";
import { Capability } from "@prisma/client";
import { upsertCapabilityOverrideAction } from "@/server/rbac/admin-actions";
import { addLotAction, assignCompanyToLotAction } from "@/server/projects/admin-config-actions";

export function ConfigurationClient({
  project,
  groups,
  members,
  allCapabilities
}: {
  project: any;
  groups: any[];
  members: any[];
  allCapabilities: any[];
}) {
  const [activeTab, setActiveTab] = useState<"SETTINGS" | "FINANCE" | "RBAC">("FINANCE");
  const [isPending, startTransition] = useTransition();

  const handleOverride = async (formData: FormData) => {
    startTransition(async () => {
      await upsertCapabilityOverrideAction({
        projectId: project.id,
        targetProjectMemberId: String(formData.get("memberId")),
        capability: formData.get("capability") as Capability,
        allowed: formData.get("allowed") === "true",
      });
    });
  };

  const handleAddLot = async (formData: FormData) => {
    startTransition(async () => {
      await addLotAction({
        projectId: project.id,
        label: String(formData.get("label")),
        description: String(formData.get("description")),
      });
    });
  };

  const handleAssignCompany = async (formData: FormData) => {
    startTransition(async () => {
      const amtStr = String(formData.get("amountHt"));
      const clean = parseFloat(amtStr.replace(/ /g, '').replace(',', '.'));
      const cents = isNaN(clean) ? "0" : String(Math.round(clean * 100));

      await assignCompanyToLotAction({
        projectId: project.id,
        projectLotId: String(formData.get("projectLotId")),
        organizationName: String(formData.get("organizationName")),
        montantMarcheHtCents: cents,
      });
    });
  };

  return (
    <div className="mt-4">
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === 'SETTINGS' ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
          onClick={() => setActiveTab('SETTINGS')}
        >
          Général
        </button>
        <button
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === 'FINANCE' ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
          onClick={() => setActiveTab('FINANCE')}
        >
          Découpage Financier
        </button>
        <button
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${activeTab === 'RBAC' ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
          onClick={() => setActiveTab('RBAC')}
        >
          Équipe & Permissions
        </button>
      </div>

      <div className="py-6">
        {/* SETTINGS TAB */}
        {activeTab === "SETTINGS" && (
          <div className="space-y-6 animate-in fade-in">
            <div className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-medium">Informations du projet</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-slate-500">Nom</p>
                  <p className="font-medium">{project.name}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Code</p>
                  <p className="font-medium">{project.code || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Marché de base (Calculé)</p>
                  <p className="font-medium text-indigo-600 dark:text-indigo-400">
                    {project.baseContract ? 
                      (Number(project.baseContract.amountHtCents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "Non défini"
                    } HT
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FINANCE TAB */}
        {activeTab === "FINANCE" && (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              
              {/* Lots List */}
              <div className="flex-1 space-y-4">
                <h2 className="text-lg font-medium">Lots existants</h2>
                {project.lots.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun lot défini pour ce projet.</p>
                ) : (
                  <div className="space-y-4">
                    {project.lots.map((lot: any) => (
                      <div key={lot.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex justify-between">
                          <h3 className="font-medium">{lot.label}</h3>
                          {lot.description && <span className="text-xs text-slate-500">{lot.description}</span>}
                        </div>
                        
                        <div className="mt-4 space-y-2">
                          <h4 className="text-xs uppercase text-slate-500 font-semibold">Entreprises Assignées</h4>
                          {lot.organizations.length === 0 ? (
                            <p className="text-xs italic text-slate-400">Aucune entreprise</p>
                          ) : (
                            lot.organizations.map((orgLink: any) => (
                              <div key={orgLink.id} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-md dark:bg-slate-800">
                                <span>{orgLink.organization.name}</span>
                                <span className="font-medium">
                                  {(Number(orgLink.montantMarcheHtCents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT
                                </span>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Assign Company Form */}
                        <form action={handleAssignCompany} className="mt-4 flex gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 text-sm">
                          <input type="hidden" name="projectLotId" value={lot.id} />
                          <input type="text" name="organizationName" required placeholder="Raison Sociale" className="flex-1 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800" />
                          <input type="text" name="amountHt" required placeholder="Montant Ex: 50000" className="w-32 rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-800" />
                          <button disabled={isPending} type="submit" className="rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">Assigner</button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add new Lot Form */}
              <div className="w-full lg:w-80 shrink-0">
                <form action={handleAddLot} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                  <h3 className="text-sm font-medium mb-3">Créer un nouveau Lot</h3>
                  <div className="space-y-3 text-sm">
                    <input type="text" name="label" required placeholder="Nom du Lot (ex: Gros Œuvre)" className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800" />
                    <input type="text" name="description" placeholder="Description courte" className="w-full rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800" />
                    <button disabled={isPending} type="submit" className="w-full rounded bg-indigo-600 py-1.5 text-white hover:bg-indigo-500 disabled:opacity-50">Ajouter</button>
                  </div>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* RBAC TAB */}
        {activeTab === "RBAC" && (
          <div className="space-y-8 animate-in fade-in">
            <section className="space-y-4">
              <h2 className="text-lg font-medium">Membres & Overrides</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((m) => (
                  <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="text-sm font-semibold truncate" title={m.user.name ?? m.user.email}>
                      {m.user.name ?? m.user.email}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex justify-between">
                      <span className="capitalize">{m.role.toLowerCase()}</span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{m.organization.name}</span>
                    </div>
                    
                    {m.capabilityOverrides.length > 0 && (
                      <div className="mt-3 bg-red-50 dark:bg-red-950/20 rounded p-2 text-xs">
                        <span className="font-medium text-red-900 dark:text-red-200">Overrides actifs:</span>
                        <ul className="mt-1 text-red-700 dark:text-red-300 space-y-1">
                          {m.capabilityOverrides.map((o: any) => (
                            <li key={o.id}>• {o.capability}: {o.allowed ? "ALLOW" : "DENY"}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <form action={handleOverride} className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 flex flex-col gap-2">
                      <input type="hidden" name="memberId" value={m.id} />
                      <select name="capability" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800" defaultValue={allCapabilities[0]}>
                        {allCapabilities.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <select name="allowed" className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800" defaultValue="false">
                          <option value="true">Autoriser (Allow)</option>
                          <option value="false">Interdire (Deny)</option>
                        </select>
                        <button disabled={isPending} type="submit" className="rounded bg-slate-900 px-3 text-xs text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-50">Appliquer</button>
                      </div>
                    </form>
                  </div>
                ))}
              </div>
            </section>
            
            <section className="space-y-3">
              <h2 className="text-lg font-medium text-slate-500">Référence des Groupes (Défaut)</h2>
              <div className="flex flex-wrap gap-4">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm w-full sm:w-auto dark:border-slate-800 dark:bg-slate-800/50">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{g.name}</div>
                    <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                      {g.capabilities.map((c: any) => <li key={c.id}>{c.capability}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

    </div>
  );
}
