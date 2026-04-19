"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { updateProjectMemberAction } from "@/server/rbac/admin-actions";
import { ModalOverlay, ModalContainer, ModalHeader, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CardSubsection } from "@/components/ui/card";

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
    <ModalOverlay>
      <ModalContainer>
        <ModalHeader
          title="Modifier le membre"
          icon={<Pencil className="h-4 w-4 text-slate-500" />}
          onClose={onClose}
        />

        <CardSubsection className="mb-4 p-3">
          <div className="text-sm font-medium text-slate-900 dark:text-white">
            {member.user.name ?? member.user.email}
          </div>
          <div className="text-xs text-slate-500">
            {member.user.email} · {member.organization.name}
          </div>
        </CardSubsection>

        {isSelf && (
          <Alert variant="warning" className="mb-4">
            Vous modifiez votre propre adhésion. Pour éviter un verrouillage, le retrait de vos
            propres droits d&apos;administration doit être effectué par un autre administrateur.
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Rôle
            </label>
            <Select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
              {(Object.keys(ROLE_LABELS) as ProjectRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Groupe de permissions
            </label>
            <Select
              value={permissionGroupId}
              onChange={(e) => setPermissionGroupId(e.target.value)}
            >
              <option value="">Aucun</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>

          {error && <Alert variant="error">{error}</Alert>}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending || !dirty}>
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
}
