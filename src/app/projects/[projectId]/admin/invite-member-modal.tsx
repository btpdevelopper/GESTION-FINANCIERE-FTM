"use client";

import { useState, useTransition } from "react";
import { UserPlus, Mail } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { inviteProjectMemberAction } from "@/server/rbac/admin-actions";
import { ModalOverlay, ModalContainer, ModalHeader, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
          setSuccessMsg(`Un email d'invitation a été envoyé à ${email}.`);
          setTimeout(() => {
            reset();
            onClose();
          }, 2500);
        } else {
          reset();
          onClose();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <ModalOverlay>
      <ModalContainer maxWidth="max-w-lg">
        <ModalHeader
          title="Inviter un nouveau membre"
          icon={<UserPlus className="h-4 w-4 text-slate-500" />}
          onClose={onClose}
        />

        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Si l&apos;utilisateur n&apos;a pas encore de compte, un email d&apos;invitation lui sera
          envoyé automatiquement.
        </p>

        <datalist id="invite-org-list">
          {organizationNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@entreprise.fr"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Nom complet
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Organisation (raison sociale) <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              list="invite-org-list"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="SARL Dupont BTP"
            />
            <p className="mt-1 text-xs text-slate-400">Sera créée si elle n&apos;existe pas déjà.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Rôle <span className="text-red-500">*</span>
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
          </div>

          {successMsg && <Alert variant="success">{successMsg}</Alert>}
          {error && <Alert variant="error">{error}</Alert>}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !email || !organizationName}
          >
            {pending ? "Invitation..." : "Envoyer l'invitation"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
}
