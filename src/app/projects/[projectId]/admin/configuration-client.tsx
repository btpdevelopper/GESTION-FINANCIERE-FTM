"use client";

import { useState } from "react";
import { Capability } from "@prisma/client";
import { Settings, Layers, Users, FileSignature } from "lucide-react";
import { TabGeneral } from "./tab-general";
import { TabFinance } from "./tab-finance";
import { TabRbac } from "./tab-rbac";
import { TabContrats } from "./tab-contrats";

type TabKey = "SETTINGS" | "FINANCE" | "RBAC" | "CONTRATS";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "SETTINGS", label: "Général", icon: Settings },
  { key: "FINANCE", label: "Découpage Financier", icon: Layers },
  { key: "RBAC", label: "Équipe & Permissions", icon: Users },
  { key: "CONTRATS", label: "Contrats entreprises", icon: FileSignature },
];

export function ConfigurationClient({
  project,
  groups,
  members,
  allCapabilities,
  organizationNames,
  currentMemberId,
  enterprises,
}: {
  project: any;
  groups: any[];
  members: any[];
  allCapabilities: Capability[];
  organizationNames: string[];
  currentMemberId: string | null;
  enterprises: any[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("SETTINGS");

  return (
    <div className="mt-4">
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="py-6">
        {activeTab === "SETTINGS" && <TabGeneral project={project} />}
        {activeTab === "FINANCE" && <TabFinance projectId={project.id} lots={project.lots} />}
        {activeTab === "RBAC" && (
          <TabRbac
            projectId={project.id}
            members={members}
            groups={groups}
            allCapabilities={allCapabilities}
            organizationNames={organizationNames}
            currentMemberId={currentMemberId}
          />
        )}
        {activeTab === "CONTRATS" && (
          <TabContrats projectId={project.id} enterprises={enterprises} />
        )}
      </div>
    </div>
  );
}
