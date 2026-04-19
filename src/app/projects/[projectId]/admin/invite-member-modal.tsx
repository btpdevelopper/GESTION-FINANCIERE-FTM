"use client";

import { useState, useTransition } from "react";
import { X, UserPlus, Mail } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { inviteProjectMemberAction } from "@/server/rbac/admin-actions";

const ROLE_LABELS: Record<ProjectRole, string> = {
  MOA: "MOA — Maître d'ouvrage",
  MOE: "MOE — Maître d'œuvre",
  ENTREPRISE: "Entreprise",
};

export function InviteMemberModal({
  projectId,
  open,
  onClose,
  organizationNames,
  groups,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  organizationNames: string[];
  groups: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [role, setRole] = useState<ProjectRole>("ENTREPRISE");
  const [permissionGroupId, setPermissionGroupId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) return null;

  const reset = () => {
    setEmail("");
    setName("");
    setOrganizationName("");
    setRole("ENTREPRISE");
    setPermissionGroupId("");
    setError(null);
    setSuccessMsg(null);
  };

  const submit = () => {
    setError(null);
    setSuccessMsg(null);
    startTransition(async () => {
      try {
        const result = await inviteProjectMemberAction({
          projectId,
          email,
          name,
          organizationName,
          role,
          permissionGroupId: permissionGroupId || null,
        });
        router.refresh();
        if (result.inviteEmailSent) {
          // Brief success banner then close
          setSuccessMsg(`Un email d'invitation a été envoyé à ${email}.`);
          setTimeout(() => { reset(); onClose(); }, 2500);
        } else {
          // User already had an account — added silently
          reset();
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <UserPlus className="h-5 w-5 text-indigo-500" />
            Inviter un nouveau membre
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">
          Si l'utilisateur n'a pas encore de compte, un email d'invitation lui sera envoyé
          automatiquement pour qu'il puisse définir son mot de passe.
        </p>

        <datalist id="invite-org-list">
          {organizationNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.fr"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 pl-9 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Nom complet
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Organisation (raison sociale) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              list="invite-org-list"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="SARL Dupont BTP"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
            />
            <p className="mt-1 text-xs text-slate-500">
              Sera créée si elle n'existe pas déjà.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Rôle <span className="text-red-500">*</span>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
              >
                {(Object.keys(ROLE_LABELS) as ProjectRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Groupe de permissions
              </label>
              <select
                value={permissionGroupId}
                onChange={(e) => setPermissionGroupId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
              >
                <option value="">Aucun (sans permissions par défaut)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !email || !organizationName}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
          >
            {pending ? "Invitation..." : "Envoyer l'invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
