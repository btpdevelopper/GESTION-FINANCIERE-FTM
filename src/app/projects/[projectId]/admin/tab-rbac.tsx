"use client";

import { useState, useTransition } from "react";
import { Capability } from "@prisma/client";
import { Users, Shield, Check, X, Trash2, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  upsertCapabilityOverrideAction,
  deleteCapabilityOverrideAction,
} from "@/server/rbac/admin-actions";
import { CAPABILITY_LABELS, labelForCapability } from "./capability-labels";
import { ConfirmDialog, useConfirm } from "./confirm-dialog";

type Override = { id: string; capability: Capability; allowed: boolean };

type Member = {
  id: string;
  role: string;
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

function roleBadgeClasses(role: string): string {
  switch (role) {
    case "MOA":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300";
    case "MOE":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "ENTREPRISE":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export function TabRbac({
  projectId,
  members,
  groups,
  allCapabilities,
}: {
  projectId: string;
  members: Member[];
  groups: Group[];
  allCapabilities: Capability[];
}) {
  return (
    <div className="space-y-8 animate-in fade-in">
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Membres & Overrides
          </h2>
        </div>

        {members.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
            <Users className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              Aucun membre
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Les membres du projet apparaîtront ici une fois invités.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                projectId={projectId}
                member={m}
                allCapabilities={allCapabilities}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Groupes de permissions (référence)
          </h2>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun groupe défini.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <div
                key={g.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="font-semibold text-slate-900 dark:text-white">{g.name}</div>
                <ul className="mt-3 space-y-1.5">
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MemberCard({
  projectId,
  member,
  allCapabilities,
}: {
  projectId: string;
  member: Member;
  allCapabilities: Capability[];
}) {
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [capability, setCapability] = useState<Capability>(allCapabilities[0]);
  const [allowed, setAllowed] = useState<"true" | "false">("false");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const confirm = useConfirm();

  const applyOverride = () => {
    startTransition(async () => {
      await upsertCapabilityOverrideAction({
        projectId,
        targetProjectMemberId: member.id,
        capability,
        allowed: allowed === "true",
      });
      router.refresh();
      setShowAddOverride(false);
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="truncate text-sm font-semibold text-slate-900 dark:text-white"
            title={member.user.name ?? member.user.email}
          >
            {member.user.name ?? member.user.email}
          </div>
          {member.user.name && (
            <div className="truncate text-xs text-slate-500">{member.user.email}</div>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClasses(
            member.role,
          )}`}
        >
          {member.role}
        </span>
      </div>

      <div className="mt-2 text-xs text-slate-500">
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

      {member.capabilityOverrides.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Shield className="h-3.5 w-3.5" />
            Overrides actifs
          </div>
          <ul className="space-y-1.5">
            {member.capabilityOverrides.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-1.5">
                  {o.allowed ? (
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
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
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                  title="Retirer l'override"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        {!showAddOverride ? (
          <button
            type="button"
            onClick={() => setShowAddOverride(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un override
          </button>
        ) : (
          <div className="space-y-2">
            <select
              value={capability}
              onChange={(e) => setCapability(e.target.value as Capability)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {allCapabilities.map((c) => (
                <option key={c} value={c}>
                  {CAPABILITY_LABELS[c]?.label ?? c} ({c})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={allowed}
                onChange={(e) => setAllowed(e.target.value as "true" | "false")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="true">Autoriser (Allow)</option>
                <option value="false">Interdire (Deny)</option>
              </select>
              <button
                type="button"
                onClick={applyOverride}
                disabled={pending}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {pending ? "..." : "Appliquer"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddOverride(false)}
                className="rounded-lg px-2 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm.state.open}
        title={confirm.state.title}
        message={confirm.state.message}
        confirmLabel={confirm.state.confirmLabel}
        tone={confirm.state.tone}
        onConfirm={confirm.state.onConfirm}
        onClose={confirm.close}
      />
    </div>
  );
}
