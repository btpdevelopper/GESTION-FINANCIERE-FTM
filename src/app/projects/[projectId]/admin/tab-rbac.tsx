"use client";

import { useState, useTransition } from "react";
import { Capability, ProjectRole } from "@prisma/client";
import {
  Users,
  Shield,
  Check,
  X,
  Trash2,
  Plus,
  ShieldCheck,
  UserPlus,
  Pencil,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  upsertCapabilityOverrideAction,
  deleteCapabilityOverrideAction,
  removeProjectMemberAction,
} from "@/server/rbac/admin-actions";
import { CAPABILITY_LABELS, labelForCapability } from "./capability-labels";
import { ConfirmDialog, useConfirm } from "./confirm-dialog";
import { InviteMemberModal } from "./invite-member-modal";
import { EditMemberModal } from "./edit-member-modal";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/badge";
import { Card, CardSubsection } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

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

export function TabRbac({
  projectId,
  members,
  groups,
  allCapabilities,
  organizationNames,
  currentMemberId,
}: {
  projectId: string;
  members: Member[];
  groups: Group[];
  allCapabilities: Capability[];
  organizationNames: string[];
  currentMemberId: string | null;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Membres du projet
            </h2>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              {members.length}
            </span>
          </div>
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="h-3.5 w-3.5" />
            Inviter un membre
          </Button>
        </div>

        {members.length === 0 ? (
          <EmptyState
            dashed
            icon={<Users className="h-8 w-8" />}
            title="Aucun membre"
            description="Commencez par inviter les membres de votre équipe projet."
            action={
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" />
                Inviter un membre
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                projectId={projectId}
                member={m}
                allCapabilities={allCapabilities}
                groups={groups}
                isSelf={m.id === currentMemberId}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Groupes de permissions (référence)
          </h2>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun groupe défini.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <Card key={g.id} className="p-3">
                <div className="text-sm font-medium text-slate-900 dark:text-white">{g.name}</div>
                <ul className="mt-2 space-y-1">
                  {g.capabilities.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400"
                    >
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                      <span>
                        {labelForCapability(c.capability)}{" "}
                        <span className="text-slate-400">({c.capability})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </section>

      <InviteMemberModal
        projectId={projectId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        organizationNames={organizationNames}
        groups={groups}
      />
    </div>
  );
}

function MemberCard({
  projectId,
  member,
  allCapabilities,
  groups,
  isSelf,
}: {
  projectId: string;
  member: Member;
  allCapabilities: Capability[];
  groups: Group[];
  isSelf: boolean;
}) {
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [capability, setCapability] = useState<Capability>(allCapabilities[0]);
  const [allowed, setAllowed] = useState<"true" | "false">("false");
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();

  const applyOverride = () => {
    startTransition(async () => {
      try {
        await upsertCapabilityOverrideAction({
          projectId,
          targetProjectMemberId: member.id,
          capability,
          allowed: allowed === "true",
        });
        router.refresh();
        setShowAddOverride(false);
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
      message: `${member.user.name ?? member.user.email} perdra immédiatement l'accès au projet. Les FTM, messages et devis qu'il/elle a créés seront conservés mais leur auteur deviendra anonyme. Cette action est irréversible.`,
      confirmLabel: "Retirer du projet",
      tone: "danger",
      onConfirm: async () => {
        try {
          await removeProjectMemberAction({
            projectId,
            targetProjectMemberId: member.id,
          });
          router.refresh();
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        }
      },
    });
  };

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div
              className="truncate text-sm font-medium text-slate-900 dark:text-white"
              title={member.user.name ?? member.user.email}
            >
              {member.user.name ?? member.user.email}
            </div>
            {isSelf && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Vous
              </span>
            )}
          </div>
          {member.user.name && (
            <div className="truncate text-xs text-slate-500">{member.user.email}</div>
          )}
        </div>
        <RoleBadge role={member.role} />
      </div>

      <div className="mt-1.5 text-xs text-slate-500">
        {member.organization.name}
        {member.permissionGroup && (
          <>
            {" · "}
            <span className="font-medium text-slate-600 dark:text-slate-400">
              {member.permissionGroup.name}
            </span>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 justify-center border border-slate-200 dark:border-slate-700"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-3 w-3" />
          Modifier
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={askRemoveMember}
          disabled={isSelf}
          title={isSelf ? "Vous ne pouvez pas vous retirer vous-même." : "Retirer du projet"}
          className="disabled:hover:bg-red-50"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {member.capabilityOverrides.length > 0 && (
        <CardSubsection className="mt-3 p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
            <Shield className="h-3 w-3" />
            Overrides actifs
          </div>
          <ul className="space-y-1">
            {member.capabilityOverrides.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-1.5">
                  {o.allowed ? (
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
                  )}
                  <div>
                    <div
                      className={`font-medium ${
                        o.allowed
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {labelForCapability(o.capability)}
                    </div>
                    <div className="text-[10px] text-slate-400">({o.capability})</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => askDeleteOverride(o.id, o.capability)}
                  className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Retirer l'override"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </CardSubsection>
      )}

      <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        {!showAddOverride ? (
          <button
            type="button"
            onClick={() => setShowAddOverride(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-slate-200 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500"
          >
            <Plus className="h-3 w-3" />
            Ajouter un override
          </button>
        ) : (
          <div className="space-y-2">
            <Select
              value={capability}
              onChange={(e) => setCapability(e.target.value as Capability)}
            >
              {allCapabilities.map((c) => (
                <option key={c} value={c}>
                  {CAPABILITY_LABELS[c]?.label ?? c} ({c})
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <Select
                value={allowed}
                onChange={(e) => setAllowed(e.target.value as "true" | "false")}
                className="flex-1"
              >
                <option value="true">Autoriser (Allow)</option>
                <option value="false">Interdire (Deny)</option>
              </Select>
              <Button size="sm" onClick={applyOverride} disabled={pending}>
                {pending ? "..." : "Appliquer"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAddOverride(false)}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </div>

      <EditMemberModal
        projectId={projectId}
        member={{
          id: member.id,
          role: member.role,
          permissionGroupId: member.permissionGroupId,
          user: member.user,
          organization: member.organization,
        }}
        groups={groups}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        isSelf={isSelf}
      />

      <ConfirmDialog
        open={confirm.state.open}
        title={confirm.state.title}
        message={confirm.state.message}
        confirmLabel={confirm.state.confirmLabel}
        tone={confirm.state.tone}
        onConfirm={confirm.state.onConfirm}
        onClose={confirm.close}
      />
    </Card>
  );
}
