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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

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

  const totalCents = useMemo(
    () =>
      lots.reduce(
        (sum, l) =>
          sum +
          l.organizations.reduce(
            (s, o) => s + BigInt(o.montantMarcheHtCents.toString()),
            BigInt(0),
          ),
        BigInt(0),
      ),
    [lots],
  );

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
        await addLotAction({ projectId, label: newLabel, description: newDescription });
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
    <div className="space-y-4">
      {/* Summary bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="rounded bg-slate-100 p-2 dark:bg-slate-800">
            <Layers className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </div>
          <div>
            <div className="text-xs text-slate-500">
              {lots.length} lot{lots.length > 1 ? "s" : ""} —{" "}
              {lots.reduce((n, l) => n + l.organizations.length, 0)} entreprise(s)
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              Total assigné : {formatEUR(totalCents)} HT
            </div>
          </div>
        </div>
        <Button size="sm" onClick={() => setNewLotOpen((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          Nouveau lot
        </Button>
      </Card>

      {/* New lot inline panel */}
      {newLotOpen && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
            Créer un nouveau lot
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nom du lot (ex: Gros Œuvre)"
            />
            <Input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optionnel)"
            />
          </div>
          {newError && <Alert variant="error" className="mt-3">{newError}</Alert>}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewLotOpen(false);
                setNewError(null);
              }}
            >
              Annuler
            </Button>
            <Button size="sm" onClick={createLot} disabled={pending}>
              {pending ? "Création..." : "Créer le lot"}
            </Button>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {lots.length === 0 && !newLotOpen && (
        <EmptyState
          dashed
          icon={<Layers className="h-8 w-8" />}
          title="Aucun lot défini"
          description="Créez votre premier lot pour commencer à structurer le découpage financier."
          action={
            <Button size="sm" onClick={() => setNewLotOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Créer un lot
            </Button>
          }
        />
      )}

      {/* Lots list */}
      <div className="space-y-3">
        {lots.map((lot) => {
          const isOpen = expanded.has(lot.id);
          const lotTotal = lot.organizations.reduce(
            (s, o) => s + BigInt(o.montantMarcheHtCents.toString()),
            BigInt(0),
          );

          return (
            <Card key={lot.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpanded(lot.id)}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">
                      {lot.label}
                    </div>
                    {lot.description && (
                      <div className="text-xs text-slate-500">{lot.description}</div>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">
                      {lot.organizations.length} entreprise
                      {lot.organizations.length > 1 ? "s" : ""}
                    </div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEUR(lotTotal)}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-slate-200 dark:border-slate-700"
                    onClick={() => setDrawerLot(lot)}
                  >
                    <UserPlus className="h-3 w-3" />
                    Assigner
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEditLot(lot)}
                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                    title="Modifier le lot"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800/30">
                  {lot.organizations.length === 0 ? (
                    <p className="py-2 text-center text-xs italic text-slate-400">
                      Aucune entreprise assignée à ce lot.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {lot.organizations.map((lo) => (
                        <div
                          key={lo.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm text-slate-800 dark:text-slate-200">
                              {lo.organization.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {formatEUR(lo.montantMarcheHtCents)}
                            </span>
                            <span className="text-xs text-slate-400">HT</span>
                            <button
                              type="button"
                              onClick={() => askRemoveOrg(lo.id, lo.organization.name, lot.label)}
                              className="ml-1 rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                              title="Retirer du lot"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
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
