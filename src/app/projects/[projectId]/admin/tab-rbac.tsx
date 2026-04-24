"use client";

import { useState, useMemo } from "react";
import { Capability, ProjectRole } from "@prisma/client";
import {
  Users,
  ShieldCheck,
  UserPlus,
  Search,
} from "lucide-react";
import { labelForCapability } from "./capability-labels";
import { InviteMemberModal } from "./invite-member-modal";
import { MemberConfigModal } from "./member-config-modal";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
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
  defaultGroupIdsByRole,
}: {
  projectId: string;
  members: Member[];
  groups: Group[];
  allCapabilities: Capability[];
  organizationNames: string[];
  currentMemberId: string | null;
  defaultGroupIdsByRole: Record<ProjectRole, string | null>;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | ProjectRole>("ALL");
  const [orgFilter, setOrgFilter] = useState<string>("ALL");

  const memberOrgNames = useMemo(() => {
    const names = new Set<string>();
    for (const m of members) names.add(m.organization.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "fr"));
  }, [members]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== "ALL" && m.role !== roleFilter) return false;
      if (orgFilter !== "ALL" && m.organization.name !== orgFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = m.user.name?.toLowerCase() ?? "";
        const email = m.user.email.toLowerCase();
        const org = m.organization.name.toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !org.includes(q)) return false;
      }
      return true;
    });
  }, [members, roleFilter, orgFilter, search]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Membres du projet
          </h2>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {filteredMembers.length}/{members.length}
          </span>
        </div>
        <Button onClick={() => setInviteOpen(true)} size="sm">
          <UserPlus className="h-3.5 w-3.5" />
          Inviter
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Rechercher nom, email, org…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 py-1.5 text-xs"
          />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "ALL" | ProjectRole)}
          className="w-auto min-w-[120px] py-1.5 text-xs"
        >
          <option value="ALL">Tous les rôles</option>
          <option value="MOA">MOA</option>
          <option value="MOE">MOE</option>
          <option value="ENTREPRISE">Entreprise</option>
        </Select>
        <Select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="w-auto min-w-[140px] py-1.5 text-xs"
        >
          <option value="ALL">Toutes les orgs</option>
          {memberOrgNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
        {(search || roleFilter !== "ALL" || orgFilter !== "ALL") && (
          <button
            type="button"
            onClick={() => { setSearch(""); setRoleFilter("ALL"); setOrgFilter("ALL"); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
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
      ) : filteredMembers.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucun membre ne correspond aux filtres.
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500">Nom</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500">Email</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500">Organisation</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500">Rôle</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500">Groupe</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 text-center">Overrides</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((m) => {
                const isSelf = m.id === currentMemberId;
                const overrideCount = m.capabilityOverrides.length;
                const denyCount = m.capabilityOverrides.filter((o) => !o.allowed).length;
                const grantCount = overrideCount - denyCount;

                return (
                  <tr
                    key={m.id}
                    onClick={() => setSelectedMember(m)}
                    className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-800/30"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[160px]" title={m.user.name ?? m.user.email}>
                          {m.user.name ?? m.user.email}
                        </span>
                        {isSelf && (
                          <span className="shrink-0 rounded bg-slate-200 px-1 py-px text-[8px] font-bold uppercase text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            Vous
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500 truncate max-w-[180px]" title={m.user.email}>
                      {m.user.email}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 truncate max-w-[120px]" title={m.organization.name}>
                      {m.organization.name}
                    </td>
                    <td className="px-3 py-2">
                      <RoleBadge role={m.role} />
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {m.permissionGroup?.name ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {overrideCount === 0 ? (
                        <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px]">
                          {grantCount > 0 && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                              +{grantCount}
                            </span>
                          )}
                          {denyCount > 0 && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-900/40 dark:text-red-400">
                              −{denyCount}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Permission groups reference */}
      <details className="group">
        <summary className="flex cursor-pointer items-center gap-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
          Groupes de permissions
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {groups.length}
          </span>
        </summary>
        {groups.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Aucun groupe défini.</p>
        ) : (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <Card key={g.id} className="p-2.5">
                <div className="text-xs font-medium text-slate-900 dark:text-white">{g.name}</div>
                <ul className="mt-1.5 space-y-0.5">
                  {g.capabilities.map((c) => (
                    <li key={c.id} className="text-[11px] text-slate-500 dark:text-slate-400">
                      • {labelForCapability(c.capability)}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </details>

      {/* Modals */}
      <InviteMemberModal
        projectId={projectId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        organizationNames={organizationNames}
        groups={groups}
        defaultGroupIdsByRole={defaultGroupIdsByRole}
      />

      {selectedMember && (
        <MemberConfigModal
          projectId={projectId}
          member={selectedMember}
          groups={groups}
          allCapabilities={allCapabilities}
          open={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          isSelf={selectedMember.id === currentMemberId}
        />
      )}
    </div>
  );
}
