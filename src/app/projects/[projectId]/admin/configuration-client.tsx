"use client";

import { useState } from "react";
import { Capability } from "@prisma/client";
import { Settings, Layers, Users, FileSignature } from "lucide-react";
import { TabGeneral } from "./tab-general";
import { TabFinance } from "./tab-finance";
import { TabRbac } from "./tab-rbac";
import { TabContrats } from "./tab-contrats";
import { TabNav, TabNavButton } from "@/components/ui";

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
      <TabNav>
        {TABS.map(({ key, label, icon: Icon }) => (
          <TabNavButton
            key={key}
            active={activeTab === key}
            onClick={() => setActiveTab(key)}
            className="flex items-center gap-1.5"
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </TabNavButton>
        ))}
      </TabNav>

      <div className="py-5">
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
