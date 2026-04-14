"use client";

import { useState, useTransition } from "react";
import { createProjectExecutionAction } from "@/server/projects/wizard-actions";
import { useRouter } from "next/navigation";

export function WizardForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Gen
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");

  // Step 2: Lots & Orgs
  const [lots, setLots] = useState<{
    id: number;
    label: string;
    description: string;
    organizations: { id: number; name: string; montantStr: string }[];
  }[]>([
    { id: Date.now(), label: "Lot 1", description: "", organizations: [] }
  ]);

  // Step 3: Users
  const [users, setUsers] = useState<{
    id: number;
    email: string;
    name: string;
    role: "MOA" | "MOE" | "ENTREPRISE";
    organizationName: string;
  }[]>([]);

  // Helpers Lot Phase
  const addLot = () => {
    setLots([...lots, { id: Date.now(), label: `Lot ${lots.length + 1}`, description: "", organizations: [] }]);
  };
  
  const removeLot = (lotId: number) => {
    setLots(lots.filter(l => l.id !== lotId));
  };

  const addCompanyToLot = (lotId: number) => {
    setLots(lots.map(l => l.id === lotId ? { ...l, organizations: [...l.organizations, { id: Date.now(), name: "", montantStr: "" }] } : l));
  };

  const updateCompanyInLot = (lotId: number, companyId: number, field: "name" | "montantStr", value: string) => {
    setLots(lots.map(l => l.id === lotId ? {
      ...l, organizations: l.organizations.map(o => o.id === companyId ? { ...o, [field]: value } : o)
    } : l));
  };

  const removeCompanyFromLot = (lotId: number, companyId: number) => {
    setLots(lots.map(l => l.id === lotId ? {
      ...l, organizations: l.organizations.filter(o => o.id !== companyId)
    } : l));
  };

  // Helpers User Phase
  const addUser = () => {
    setUsers([...users, { id: Date.now(), email: "", name: "", role: "ENTREPRISE", organizationName: "" }]);
  };

  const removeUser = (userId: number) => {
    setUsers(users.filter(u => u.id !== userId));
  };

  const updateUser = (userId: number, field: "email" | "name" | "role" | "organizationName", value: string) => {
    setUsers(users.map(u => u.id === userId ? { ...u, [field]: value } : u));
  };

  // Available Orgs (derived from step 2 to populate dropdowns)
  const availableOrgs = Array.from(new Set(lots.flatMap(l => l.organizations.map(o => o.name)).filter(n => n.trim() !== "")));

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!projectName.trim()) { setError("Le nom du projet est requis."); return; }
    }
    if (step === 2) {
      if (lots.length === 0) { setError("Veuillez créer au moins un lot."); return; }
      const emptyOrgs = lots.some(l => l.organizations.some(o => !o.name.trim() || !o.montantStr.trim()));
      if (emptyOrgs) { setError("Toutes les entreprises doivent avoir un nom et un montant HT."); return; }
    }
    if (step === 3) {
      const invalidUsers = users.some(u => !u.email.trim() || !u.role || !u.organizationName.trim());
      if (invalidUsers) { setError("Toutes les invitations doivent avoir un email, rôle, et entreprise."); return; }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setStep(step + 1);
  };

  const parseMontantToCents = (montantStr: string) => {
    // Handle "1 500,50" -> 1500.50
    const clean = parseFloat(montantStr.replace(/ /g, '').replace(',', '.'));
    if (isNaN(clean)) return "0";
    return String(Math.round(clean * 100));
  };

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await createProjectExecutionAction({
          name: projectName,
          code: projectCode,
          lots: lots.map(l => ({
            label: l.label,
            description: l.description,
            organizations: l.organizations.map(o => ({
              organizationName: o.name,
              montantMarcheHtCents: parseMontantToCents(o.montantStr)
            }))
          })),
          users: users.map(u => ({
            email: u.email,
            name: u.name,
            role: u.role,
            organizationName: u.organizationName
          }))
        });
        // Success handled by redirect in action
      } catch (err: any) {
        setError(err.message || "Une erreur est survenue lors de la création.");
      }
    });
  };

  // Calculations for Step 4
  const totalCents = lots.reduce((acc, lot) => {
    return acc + lot.organizations.reduce((sum, org) => {
      return sum + parseInt(parseMontantToCents(org.montantStr));
    }, 0);
  }, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      
      {/* Progress Bar */}
      <div className="mb-8 flex items-center justify-between">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors
              ${step === i ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" 
              : step > i ? "bg-emerald-500 text-white" 
              : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
            >
              {step > i ? "✓" : i}
            </div>
            {i < 4 && <div className="h-0.5 w-12 bg-slate-100 sm:w-24 dark:bg-slate-800" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Step 1 */}
      {step === 1 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
          <h2 className="text-xl font-semibold">1. Informations Générales</h2>
          <div className="space-y-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Nom du Projet *</span>
              <input
                type="text"
                autoFocus
                placeholder="Ex. Rénovation Tour Blanche"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="rounded-lg border border-slate-300 bg-transparent px-4 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Code Affaire (Optionnel)</span>
              <input
                type="text"
                placeholder="Ex. 2026-TB"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                className="rounded-lg border border-slate-300 bg-transparent px-4 py-2 focus:border-indigo-500 dark:border-slate-700"
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div>
            <h2 className="text-xl font-semibold">2. Découpage Financier</h2>
            <p className="text-sm text-slate-500 mt-1">Créez les lots structurels et assignez le montant marché initial par entreprise.</p>
          </div>

          <div className="space-y-6">
            {lots.map((lot, idx) => (
              <div key={lot.id} className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-5 dark:border-slate-800 dark:bg-slate-900/50">
                <button
                  onClick={() => removeLot(lot.id)}
                  className="absolute right-4 top-4 text-slate-400 hover:text-red-500"
                  title="Supprimer Lot"
                >×</button>
                <div className="mb-4 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Label du Lot</span>
                    <input
                      type="text"
                      value={lot.label}
                      onChange={(e) => setLots(lots.map(l => l.id === lot.id ? { ...l, label: e.target.value } : l))}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-black"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">Description (Optionnelle)</span>
                    <input
                      type="text"
                      value={lot.description}
                      onChange={(e) => setLots(lots.map(l => l.id === lot.id ? { ...l, description: e.target.value } : l))}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-black"
                    />
                  </label>
                </div>

                {/* Enterprises in Lot */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Entreprises & Montants</h4>
                  {lot.organizations.map((org) => (
                    <div key={org.id} className="flex flex-wrap items-end gap-3 sm:flex-nowrap">
                      <label className="flex flex-1 flex-col gap-1 text-sm">
                        <span className="text-xs text-slate-500">Raison Sociale</span>
                        <input
                          type="text"
                          placeholder="Nom de l'entreprise"
                          value={org.name}
                          onChange={(e) => updateCompanyInLot(lot.id, org.id, "name", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-black"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-sm sm:w-48">
                        <span className="text-xs text-slate-500">Marché HT initial (€)</span>
                        <input
                          type="text"
                          placeholder="Ex: 50000,50"
                          value={org.montantStr}
                          onChange={(e) => updateCompanyInLot(lot.id, org.id, "montantStr", e.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-black"
                        />
                      </label>
                      <button
                        onClick={() => removeCompanyFromLot(lot.id, org.id)}
                        className="mb-1 rounded-md px-2 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addCompanyToLot(lot.id)}
                    className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    + Ajouter une entreprise à ce lot
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={addLot}
            className="w-full text-center rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            + Créer un nouveau lot
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div>
            <h2 className="text-xl font-semibold">3. Équipe du Projet</h2>
            <p className="text-sm text-slate-500 mt-1">Invitez les intervenants qui recevront accès par mail.</p>
            <p className="text-sm font-medium text-amber-600 mt-2 bg-amber-50 rounded p-2 border border-amber-200">
              ⚠️ N'oubliez pas de vous inclure dans la liste avec votre adresse email actuelle pour avoir accès au projet une fois créé.
            </p>
          </div>

          <div className="space-y-4">
            {users.map((user) => (
              <div key={user.id} className="relative rounded-lg border border-slate-200 bg-slate-50/50 p-4 pt-8 dark:border-slate-800 dark:bg-slate-900/50">
                <button
                  onClick={() => removeUser(user.id)}
                  className="absolute right-3 top-3 text-red-400 hover:text-red-500"
                >×</button>
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    type="email"
                    placeholder="Adresse Email"
                    value={user.email}
                    onChange={(e) => updateUser(user.id, "email", e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-black"
                  />
                  <input
                    type="text"
                    placeholder="Nom complet (Optionnel)"
                    value={user.name}
                    onChange={(e) => updateUser(user.id, "name", e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-black"
                  />
                  <select
                    value={user.role}
                    onChange={(e) => updateUser(user.id, "role", e.target.value as any)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-black"
                  >
                    <option value="ENTREPRISE">Entreprise</option>
                    <option value="MOE">MOE</option>
                    <option value="MOA">MOA</option>
                  </select>
                  <select
                    value={user.organizationName}
                    onChange={(e) => updateUser(user.id, "organizationName", e.target.value)}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-black"
                  >
                    <option value="">-- Sélectionnez l'entreprise --</option>
                    {availableOrgs.map(orgName => (
                      <option key={orgName} value={orgName}>{orgName}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {availableOrgs.length > 0 ? (
              <button
                onClick={addUser}
                className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                + Ajouter un membre
              </button>
            ) : (
              <p className="text-xs italic text-slate-500">Vous devez déclarer des raisons sociales dans l'étape 2 (Lots) pour assigner des membres.</p>
            )}
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 4 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Récapitulatif Financier</h2>
            <p className="mt-1 text-slate-500">Veuillez vérifier les informations créées avant de valider.</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-6 dark:bg-slate-800/50">
            <div className="flex flex-wrap justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
              <div>
                <p className="text-sm text-slate-500">Projet</p>
                <p className="text-lg font-semibold">{projectName}</p>
                {projectCode && <p className="text-xs text-slate-400">Code: {projectCode}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Contrat de Base (Calculé)</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {(totalCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">Lots provisionnés ({lots.length})</p>
                <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
                  {lots.map(l => <li key={l.id}>{l.label} ({l.organizations.length} entreprises)</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Equipe invitée ({users.length})</p>
                <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
                  {users.map(u => <li key={u.id}>{u.email} ({u.role}) — {u.organizationName}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6 dark:border-slate-800">
        <button
          onClick={() => step > 1 ? setStep(step - 1) : router.back()}
          disabled={isPending}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {step === 1 ? "Annuler" : "Précédent"}
        </button>
        
        {step < 4 ? (
          <button
            onClick={handleNext}
            className="rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            Suivant
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-md bg-indigo-600 px-8 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-70 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {isPending ? "Création en cours..." : "Créer le projet 🚀"}
          </button>
        )}
      </div>
    </div>
  );
}
