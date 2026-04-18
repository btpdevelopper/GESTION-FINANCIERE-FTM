"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  Layers,
  Building2,
  UserPlus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  addLotAction,
  removeOrganizationFromLotAction,
} from "@/server/projects/admin-config-actions";
import { AssignCompaniesDrawer } from "./assign-companies-drawer";
import { EditLotModal } from "./edit-lot-modal";
import { ConfirmDialog, useConfirm } from "./confirm-dialog";

type LotOrg = {
  id: string;
  montantMarcheHtCents: bigint | string;
  organization: { id: string; name: string };
};

type Lot = {
  id: string;
  label: string;
  description: string | null;
  organizations: LotOrg[];
};

function formatEUR(cents: bigint | string): string {
  return (Number(BigInt(cents.toString())) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

export function TabFinance({
  projectId,
  lots,
}: {
  projectId: string;
  lots: Lot[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(lots.map((l) => l.id)));
  const [drawerLot, setDrawerLot] = useState<Lot | null>(null);
  const [editLot, setEditLot] = useState<Lot | null>(null);
  const [newLotOpen, setNewLotOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const allOrgNames = useMemo(() => {
    const names = new Set<string>();
    for (const lot of lots) {
      for (const o of lot.organizations) names.add(o.organization.name);
    }
    return Array.from(names).sort();
  }, [lots]);

  const totalCents = useMemo(() => {
    return lots.reduce(
      (sum, l) =>
        sum +
        l.organizations.reduce(
          (s, o) => s + BigInt(o.montantMarcheHtCents.toString()),
          BigInt(0),
        ),
      BigInt(0),
    );
  }, [lots]);

  const toggleExpanded = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const createLot = () => {
    setNewError(null);
    if (!newLabel.trim()) {
      setNewError("Le nom du lot est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await addLotAction({
          projectId,
          label: newLabel,
          description: newDescription,
        });
        setNewLabel("");
        setNewDescription("");
        setNewLotOpen(false);
        router.refresh();
      } catch (err) {
        setNewError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const askRemoveOrg = (lotOrgId: string, orgName: string, lotLabel: string) => {
    confirm.ask({
      title: "Retirer cette entreprise ?",
      message: `${orgName} sera retirée du lot « ${lotLabel} ». Le marché de base sera recalculé.`,
      confirmLabel: "Retirer",
      tone: "danger",
      onConfirm: async () => {
        await removeOrganizationFromLotAction({ projectId, lotOrganizationId: lotOrgId });
        router.refresh();
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/40">
            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {lots.length} lot{lots.length > 1 ? "s" : ""} —{" "}
              {lots.reduce((n, l) => n + l.organizations.length, 0)} entreprise(s)
            </div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              Total assigné : {formatEUR(totalCents)} HT
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNewLotOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-slate-800 hover:shadow-lg active:scale-95 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          <Plus className="h-4 w-4" />
          Nouveau lot
        </button>
      </div>

      {/* New lot inline panel */}
      {newLotOpen && (
        <div className="animate-in slide-in-from-top-2 fade-in rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
            Créer un nouveau lot
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nom du lot (ex: Gros Œuvre)"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optionnel)"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          {newError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {newError}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNewLotOpen(false);
                setNewError(null);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={createLot}
              disabled={pending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
            >
              {pending ? "Création..." : "Créer le lot"}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {lots.length === 0 && !newLotOpen && (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <Layers className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-700" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
            Aucun lot défini
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Créez votre premier lot pour commencer à structurer le découpage financier.
          </p>
          <button
            type="button"
            onClick={() => setNewLotOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Créer un lot
          </button>
        </div>
      )}

      {/* Lots list */}
      <div className="space-y-4">
        {lots.map((lot) => {
          const isOpen = expanded.has(lot.id);
          const lotTotal = lot.organizations.reduce(
            (s, o) => s + BigInt(o.montantMarcheHtCents.toString()),
            BigInt(0),
          );

          return (
            <div
              key={lot.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <button
                  type="button"
                  onClick={() => toggleExpanded(lot.id)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {lot.label}
                    </div>
                    {lot.description && (
                      <div className="text-xs text-slate-500">{lot.description}</div>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">
                      {lot.organizations.length} entreprise
                      {lot.organizations.length > 1 ? "s" : ""}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEUR(lotTotal)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDrawerLot(lot)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Assigner
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditLot(lot)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="Modifier le lot"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/30">
                  {lot.organizations.length === 0 ? (
                    <p className="py-3 text-center text-sm italic text-slate-400">
                      Aucune entreprise assignée à ce lot.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-700/50">
                      {lot.organizations.map((lo) => (
                        <div
                          key={lo.id}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                              {lo.organization.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatEUR(lo.montantMarcheHtCents)}
                            </span>
                            <span className="text-xs text-slate-400">HT</span>
                            <button
                              type="button"
                              onClick={() =>
                                askRemoveOrg(lo.id, lo.organization.name, lot.label)
                              }
                              className="ml-2 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                              title="Retirer du lot"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {drawerLot && (
        <AssignCompaniesDrawer
          projectId={projectId}
          lotId={drawerLot.id}
          lotLabel={drawerLot.label}
          existingOrgNames={allOrgNames}
          open={!!drawerLot}
          onClose={() => setDrawerLot(null)}
        />
      )}

      {editLot && (
        <EditLotModal
          projectId={projectId}
          lot={{
            id: editLot.id,
            label: editLot.label,
            description: editLot.description,
            organizationsCount: editLot.organizations.length,
          }}
          open={!!editLot}
          onClose={() => setEditLot(null)}
        />
      )}

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
