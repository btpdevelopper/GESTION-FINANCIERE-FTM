"use client";

import { FtmPhase } from "@prisma/client";
import { Check, History, X } from "lucide-react";
import React, { useState } from "react";

const PHASE_STEPS = [
  { key: "ETUDES", label: "Études", phase: FtmPhase.ETUDES },
  { key: "QUOTING", label: "Devis", phase: FtmPhase.QUOTING },
  { key: "ANALYSIS", label: "Analyse MOE", phase: FtmPhase.ANALYSIS },
  { key: "MOA_FINAL", label: "Validation MOA", phase: FtmPhase.MOA_FINAL },
] as const;

const PHASE_ORDER = [
  FtmPhase.ETUDES,
  FtmPhase.QUOTING,
  FtmPhase.ANALYSIS,
  FtmPhase.MOA_FINAL,
];

type PhaseKey = (typeof PHASE_STEPS)[number]["key"];

function getStepStatus(ftmPhase: FtmPhase, stepIndex: number) {
  if (ftmPhase === FtmPhase.CANCELLED) return "CANCELLED" as const;
  if (ftmPhase === FtmPhase.ACCEPTED) return "COMPLETED" as const;
  const currentIndex = PHASE_ORDER.indexOf(ftmPhase as any);
  if (stepIndex < currentIndex) return "COMPLETED" as const;
  if (stepIndex === currentIndex) return "ACTIVE" as const;
  return "UPCOMING" as const;
}

function getDefaultTab(ftmPhase: FtmPhase): PhaseKey {
  if (ftmPhase === FtmPhase.CANCELLED || ftmPhase === FtmPhase.ACCEPTED) {
    return "MOA_FINAL";
  }
  const idx = PHASE_ORDER.indexOf(ftmPhase as any);
  return PHASE_STEPS[Math.max(0, idx)].key;
}

export function FtmDetailShell({
  ftm,
  tabContent,
  historyDrawer,
  headerSection,
}: {
  ftm: { phase: FtmPhase; title: string; number: number };
  tabContent: Record<PhaseKey, React.ReactNode>;
  historyDrawer: React.ReactNode;
  headerSection: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<PhaseKey>(() =>
    getDefaultTab(ftm.phase)
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-0">
      <div className="rounded-t-xl border border-b-0 border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
        {headerSection}
        <div className="flex items-center">
          <div className="flex flex-1 items-center">
            {PHASE_STEPS.map((step, idx) => {
              const status = getStepStatus(ftm.phase, idx);
              const isSelected = activeTab === step.key;
              const isLast = idx === PHASE_STEPS.length - 1;
              return (
                <React.Fragment key={step.key}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(step.key)}
                    className="group flex flex-col items-center gap-1.5 focus:outline-none"
                  >
                    {/* Circle */}
                    <div
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                        status === "COMPLETED"
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : status === "ACTIVE"
                            ? "border-2 border-slate-900 bg-white text-slate-900 dark:border-slate-100 dark:bg-slate-950 dark:text-slate-100"
                            : status === "CANCELLED"
                              ? "bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600"
                              : "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-600"
                      } ${
                        isSelected
                          ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900"
                          : "group-hover:ring-1 group-hover:ring-slate-300 group-hover:ring-offset-1 dark:group-hover:ring-slate-600"
                      }`}
                    >
                      {status === "COMPLETED" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    {/* Label */}
                    <span
                      className={`text-[11px] font-medium tracking-wide transition-colors ${
                        isSelected
                          ? "text-slate-900 dark:text-slate-100"
                          : status === "ACTIVE"
                            ? "text-slate-700 dark:text-slate-300"
                            : status === "COMPLETED"
                              ? "text-slate-500 dark:text-slate-400"
                              : "text-slate-400 dark:text-slate-600"
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                  {!isLast && (
                    <div
                      className={`mx-1 mb-5 h-px flex-1 ${
                        getStepStatus(ftm.phase, idx + 1) === "COMPLETED" ||
                        status === "COMPLETED"
                          ? "bg-slate-900 dark:bg-slate-300"
                          : "bg-slate-200 dark:bg-slate-700"
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {/* History toggle */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className={`ml-4 flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              drawerOpen
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Historique
          </button>
        </div>
      </div>

      {/* ── Content Area + Drawer ── */}
      <div className="flex min-h-[500px]">
        {/* Tab content */}
        <div
          className={`flex-1 rounded-b-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/60 ${
            drawerOpen ? "rounded-br-none border-r-0" : ""
          }`}
        >
          {tabContent[activeTab]}
        </div>

        {/* Side drawer */}
        {drawerOpen && (
          <div className="w-[420px] shrink-0 rounded-br-xl border border-l-0 border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Historique des devis
                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                  FTM N°{ftm.number}
                </span>
              </h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 280px)" }}>
              {historyDrawer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
