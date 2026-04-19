"use client";

import { useState, useTransition } from "react";
import { X, Pencil } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { updateProjectMemberAction } from "@/server/rbac/admin-actions";

const ROLE_LABELS: Record<ProjectRole, string> = {
  MOA: "MOA — Maître d'ouvrage",
  MOE: "MOE — Maître d'œuvre",
  ENTREPRISE: "Entreprise",
};

export function EditMemberModal({
  projectId,
  member,
  groups,
  open,
  onClose,
  isSelf,
}: {
  projectId: string;
  member: {
    id: string;
    role: ProjectRole;
    permissionGroupId: string | null;
    user: { name: string | null; email: string };
    organization: { name: string };
  };
  groups: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  isSelf: boolean;
}) {
  const [role, setRole] = useState<ProjectRole>(member.role);
  const [permissionGroupId, setPermissionGroupId] = useState<string>(
    member.permissionGroupId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) return null;

  const dirty = role !== member.role || permissionGroupId !== (member.permissionGroupId ?? "");

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await updateProjectMemberAction({
          projectId,
          targetProjectMemberId: member.id,
          role,
          permissionGroupId: permissionGroupId || null,
        });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
            <Pencil className="h-5 w-5 text-indigo-500" />
            Modifier le membre
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/40">
          <div className="font-medium text-slate-900 dark:text-white">
            {member.user.name ?? member.user.email}
          </div>
          <div className="text-xs text-slate-500">
            {member.user.email} · {member.organization.name}
          </div>
        </div>

        {isSelf && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Vous modifiez votre propre adhésion. Pour éviter un verrouillage, le retrait de
            vos propres droits d'administration doit être effectué par un autre
            administrateur.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Rôle
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
              <option value="">Aucun</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

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
            disabled={pending || !dirty}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
          >
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
