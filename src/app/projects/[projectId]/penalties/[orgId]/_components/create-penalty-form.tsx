"use client";

import { useState, useTransition } from "react";
import { createPenaltyAction } from "@/server/penalties/penalty-actions";
import { Button, Input, Select } from "@/components/ui";
import { Plus, X } from "lucide-react";

type Situation = { id: string; numero: number; periodLabel: string; status: string };

interface Props {
  projectId: string;
  organizationId: string;
  marcheTotalCents: number;
  approvedFtmTotalCents: number;
  activePenaltiesTotalCents: number;
  eligibleSituations: Situation[];
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatPeriod(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split("-");
    const s = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return label;
}

export function CreatePenaltyForm({
  projectId,
  organizationId,
  marcheTotalCents,
  approvedFtmTotalCents,
  activePenaltiesTotalCents,
  eligibleSituations,
}: Props) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [justification, setJustification] = useState("");
  const [amountType, setAmountType] = useState<"FIXED" | "PCT_BASE_MARCHE" | "PCT_ACTUAL_MARCHE">("FIXED");
  const [inputValue, setInputValue] = useState("");
  const [applicationTarget, setApplicationTarget] = useState<"SITUATION" | "DGD">("SITUATION");
  const [situationId, setSituationId] = useState("");

  // Preview frozen amount
  const parsed = parseFloat(inputValue);
  let previewCents = 0;
  if (!isNaN(parsed) && parsed > 0) {
    if (amountType === "FIXED") {
      previewCents = Math.round(parsed * 100);
    } else {
      const base =
        amountType === "PCT_ACTUAL_MARCHE"
          ? marcheTotalCents + approvedFtmTotalCents - activePenaltiesTotalCents
          : marcheTotalCents;
      previewCents = Math.round((base * parsed) / 100);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedInput = parseFloat(inputValue);
    if (isNaN(parsedInput) || parsedInput <= 0) {
      setError("Valeur invalide.");
      return;
    }

    // inputValue for PCT: convert % to basis points (e.g. 5% → 500)
    const rawInput =
      amountType === "FIXED"
        ? Math.round(parsedInput * 100) // cents
        : Math.round(parsedInput * 100); // basis points (5% → 500 basis points = 5.00%)

    startTransition(async () => {
      try {
        await createPenaltyAction({
          projectId,
          organizationId,
          label,
          justification,
          amountType,
          inputValue: rawInput,
          applicationTarget,
          situationId: applicationTarget === "SITUATION" && situationId ? situationId : null,
        });
        setOpen(false);
        setLabel("");
        setJustification("");
        setAmountType("FIXED");
        setInputValue("");
        setApplicationTarget("SITUATION");
        setSituationId("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Créer une pénalité
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Nouvelle pénalité
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Libellé
          </label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex. : Retard de livraison — Phase 2"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Type de montant
          </label>
          <Select
            value={amountType}
            onChange={(e) => setAmountType(e.target.value as typeof amountType)}
          >
            <option value="FIXED">Montant fixe (€)</option>
            <option value="PCT_BASE_MARCHE">% du marché de base</option>
            <option value="PCT_ACTUAL_MARCHE">% du marché actuel (base + FTMs)</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            {amountType === "FIXED" ? "Montant (€ HT)" : "Pourcentage (%)"}
          </label>
          <div className="space-y-1">
            <Input
              type="number"
              step={amountType === "FIXED" ? "0.01" : "0.01"}
              min="0.01"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={amountType === "FIXED" ? "Ex. : 5000.00" : "Ex. : 5"}
              required
            />
            {previewCents > 0 && (
              <p className="text-xs text-slate-500">
                Montant calculé :{" "}
                <strong className="text-red-600 dark:text-red-400">
                  {formatEur(previewCents)}
                </strong>
                {amountType !== "FIXED" && (
                  <span>
                    {" "}(base :{" "}
                    {formatEur(
                      amountType === "PCT_ACTUAL_MARCHE"
                        ? marcheTotalCents + approvedFtmTotalCents - activePenaltiesTotalCents
                        : marcheTotalCents,
                    )}
                    )
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Application
          </label>
          <Select
            value={applicationTarget}
            onChange={(e) => setApplicationTarget(e.target.value as "SITUATION" | "DGD")}
          >
            <option value="SITUATION">Sur une situation de travaux</option>
            <option value="DGD">Au DGD (décompte final)</option>
          </Select>
        </div>

        {applicationTarget === "SITUATION" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Situation cible (optionnel)
            </label>
            <Select
              value={situationId}
              onChange={(e) => setSituationId(e.target.value)}
            >
              <option value="">— Non assignée —</option>
              {eligibleSituations.map((s) => (
                <option key={s.id} value={s.id}>
                  N°{s.numero} — {formatPeriod(s.periodLabel)}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
            Justification
          </label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            required
            placeholder="Décrivez la raison de la pénalité, les dates concernées, les références contractuelles…"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer le brouillon"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
