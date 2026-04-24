"use client";

import { useState, useMemo, useTransition } from "react";
import { Capability, ProjectRole } from "@prisma/client";
import {
  Check,
  X,
  Trash2,
  Plus,
  Shield,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  updateProjectMemberAction,
  upsertCapabilityOverrideAction,
  deleteCapabilityOverrideAction,
  removeProjectMemberAction,
} from "@/server/rbac/admin-actions";
import { CAPABILITY_LABELS, labelForCapability, descriptionForCapability } from "./capability-labels";
import { ConfirmDialog, useConfirm } from "./confirm-dialog";
import { ModalOverlay, ModalContainer, ModalHeader, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/input";
import { CardSubsection } from "@/components/ui/card";

type Override = { id: string; capability: Capability; allowed: boolean };

type Member = {
  id: string;
  role: ProjectRole;
  permissionGroupId: string | null;
  user: { name: string | null; email: string };
  organization: { name: string };
  permissionGroup: { name: string } | null;
  capabilityOverrides: Override[];
};

type Group = {
  id: string;
  name: string;
  capabilities: { id: string; capability: Capability }[];
};

const ROLE_LABELS: Record<ProjectRole, string> = {
  MOA: "MOA — Maître d'ouvrage",
  MOE: "MOE — Maître d'œuvre",
  ENTREPRISE: "Entreprise",
};

export function MemberConfigModal({
  projectId,
  member,
  groups,
  allCapabilities,
  open,
  onClose,
  isSelf,
}: {
  projectId: string;
  member: Member;
  groups: Group[];
  allCapabilities: Capability[];
  open: boolean;
  onClose: () => void;
  isSelf: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();

  // --- Role & Group editing ---
  const [role, setRole] = useState<ProjectRole>(member.role);
  const [permissionGroupId, setPermissionGroupId] = useState<string>(
    member.permissionGroupId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // --- Override adding ---
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [newCap, setNewCap] = useState<Capability>(allCapabilities[0]);
  const [newAllowed, setNewAllowed] = useState<"true" | "false">("false");
  const [overridePending, startOverrideTransition] = useTransition();

  const dirty = role !== member.role || permissionGroupId !== (member.permissionGroupId ?? "");

  // Resolve which capabilities come from the group
  const groupCapSet = useMemo(() => {
    if (!permissionGroupId) return new Set<Capability>();
    const g = groups.find((g) => g.id === permissionGroupId);
    return new Set(g?.capabilities.map((c) => c.capability) ?? []);
  }, [groups, permissionGroupId]);

  // Capabilities not already overridden
  const availableCapsForOverride = useMemo(() => {
    const overridden = new Set(member.capabilityOverrides.map((o) => o.capability));
    return allCapabilities.filter((c) => !overridden.has(c));
  }, [allCapabilities, member.capabilityOverrides]);

  if (!open) return null;

  const saveRoleGroup = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateProjectMemberAction({
          projectId,
          targetProjectMemberId: member.id,
          role,
          permissionGroupId: permissionGroupId || null,
        });
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const addOverride = () => {
    startOverrideTransition(async () => {
      try {
        await upsertCapabilityOverrideAction({
          projectId,
          targetProjectMemberId: member.id,
          capability: newCap,
          allowed: newAllowed === "true",
        });
        router.refresh();
        setShowAddOverride(false);
        // Reset for next
        if (availableCapsForOverride.length > 1) {
          setNewCap(availableCapsForOverride.find((c) => c !== newCap) ?? allCapabilities[0]);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const askDeleteOverride = (overrideId: string, cap: Capability) => {
    confirm.ask({
      title: "Retirer cet override ?",
      message: `L'override sur « ${labelForCapability(cap)} » sera supprimé. Le membre reprendra la permission par défaut de son groupe.`,
      confirmLabel: "Supprimer",
      tone: "danger",
      onConfirm: async () => {
        await deleteCapabilityOverrideAction({ projectId, overrideId });
        router.refresh();
      },
    });
  };

  const askRemoveMember = () => {
    confirm.ask({
      title: "Retirer ce membre du projet ?",
      message: `${member.user.name ?? member.user.email} perdra immédiatement l'accès au projet. Cette action est irréversible.`,
      confirmLabel: "Retirer du projet",
      tone: "danger",
      onConfirm: async () => {
        try {
          await removeProjectMemberAction({
            projectId,
            targetProjectMemberId: member.id,
          });
          router.refresh();
          onClose();
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        }
      },
    });
  };

  return (
    <>
      <ModalOverlay>
        <ModalContainer className="max-w-lg">
          <ModalHeader
            title="Configuration du membre"
            icon={<Shield className="h-4 w-4 text-slate-500" />}
            onClose={onClose}
          />

          {/* Member identity */}
          <CardSubsection className="mb-4 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {member.user.name ?? member.user.email}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {member.user.email} · {member.organization.name}
                </div>
              </div>
              <RoleBadge role={member.role} />
            </div>
          </CardSubsection>

          {isSelf && (
            <Alert variant="warning" className="mb-3 text-xs">
              Vous modifiez votre propre adhésion. Le retrait de vos droits d&apos;administration doit être effectué par un autre admin.
            </Alert>
          )}

          {error && <Alert variant="error" className="mb-3">{error}</Alert>}

          {/* Section 1: Role & Group */}
          <div className="space-y-3 mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Rôle & Groupe
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Rôle
                </label>
                <Select value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="text-xs py-1.5">
                  {(Object.keys(ROLE_LABELS) as ProjectRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Groupe de permissions
                </label>
                <Select
                  value={permissionGroupId}
                  onChange={(e) => setPermissionGroupId(e.target.value)}
                  className="text-xs py-1.5"
                >
                  <option value="">Aucun</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {saved && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3 w-3" /> Enregistré
                </span>
              )}
              <Button size="sm" onClick={saveRoleGroup} disabled={pending || !dirty}>
                {pending && <Loader2 className="h-3 w-3 animate-spin" />}
                {pending ? "…" : "Enregistrer"}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-slate-800" />

          {/* Section 2: Permission Overrides */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Overrides de permissions
              </h3>
              {availableCapsForOverride.length > 0 && !showAddOverride && (
                <button
                  type="button"
                  onClick={() => { setShowAddOverride(true); setNewCap(availableCapsForOverride[0]); }}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </button>
              )}
            </div>

            {member.capabilityOverrides.length === 0 && !showAddOverride && (
              <p className="text-[11px] italic text-slate-400">
                Aucun override — les permissions viennent du groupe.
              </p>
            )}

            {/* Existing overrides */}
            {member.capabilityOverrides.length > 0 && (
              <div className="divide-y divide-slate-50 rounded border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {member.capabilityOverrides.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {o.allowed ? (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      ) : (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                          <X className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                          {labelForCapability(o.capability)}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {o.allowed ? "Autorisé" : "Interdit"}
                          {groupCapSet.has(o.capability) && !o.allowed && " (surcharge le groupe)"}
                          {!groupCapSet.has(o.capability) && o.allowed && " (ajouté hors groupe)"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => askDeleteOverride(o.id, o.capability)}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                      title="Retirer l'override"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add override form */}
            {showAddOverride && (
              <CardSubsection className="p-2.5 space-y-2">
                <Select
                  value={newCap}
                  onChange={(e) => setNewCap(e.target.value as Capability)}
                  className="text-xs py-1.5"
                >
                  {availableCapsForOverride.map((c) => (
                    <option key={c} value={c}>
                      {labelForCapability(c)}
                    </option>
                  ))}
                </Select>
                {newCap && (
                  <p className="text-[10px] text-slate-400">
                    {descriptionForCapability(newCap)}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Select
                    value={newAllowed}
                    onChange={(e) => setNewAllowed(e.target.value as "true" | "false")}
                    className="flex-1 text-xs py-1.5"
                  >
                    <option value="true">Autoriser</option>
                    <option value="false">Interdire</option>
                  </Select>
                  <Button size="sm" onClick={addOverride} disabled={overridePending}>
                    {overridePending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Appliquer"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddOverride(false)}>
                    Annuler
                  </Button>
                </div>
              </CardSubsection>
            )}
          </div>

          {/* Footer */}
          <ModalFooter>
            <Button
              variant="danger"
              size="sm"
              onClick={askRemoveMember}
              disabled={isSelf}
              title={isSelf ? "Vous ne pouvez pas vous retirer vous-même." : undefined}
            >
              <Trash2 className="h-3 w-3" />
              Retirer du projet
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Fermer
            </Button>
          </ModalFooter>
        </ModalContainer>
      </ModalOverlay>

      <ConfirmDialog
        open={confirm.state.open}
        title={confirm.state.title}
        message={confirm.state.message}
        confirmLabel={confirm.state.confirmLabel}
        tone={confirm.state.tone}
        onConfirm={confirm.state.onConfirm}
        onClose={confirm.close}
      />
    </>
  );
}
