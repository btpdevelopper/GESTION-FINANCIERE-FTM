"use client";

import { useState, useTransition } from "react";
import { Bell, Clock, RotateCw, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ModalOverlay,
  ModalContainer,
  ModalHeader,
  ModalFooter,
  Button,
  Input,
  Alert,
} from "@/components/ui";
import {
  resetReminderCadenceAction,
  updateReminderSettingsAction,
} from "@/server/ftm/ftm-actions";

const PRESETS = [
  { value: 0, label: "Désactivé" },
  { value: 3, label: "Tous les 3 jours" },
  { value: 7, label: "Toutes les semaines" },
  { value: 14, label: "Toutes les 2 semaines" },
];

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function nextRunEstimate(
  lastReminderAt: Date | string | null,
  freqDays: number | null,
): string {
  if (!freqDays || freqDays <= 0) return "—";
  if (!lastReminderAt) return "Au prochain run (demain 08:00 UTC)";
  const next = new Date(
    new Date(lastReminderAt).getTime() + freqDays * 24 * 60 * 60 * 1000,
  );
  return fmtDate(next);
}

type Props = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  ftmId: string;
  concernedOrgId: string;
  orgName: string;
  initialFreq: number | null;
  lastReminderAt: Date | string | null;
  dateLimite: Date | string | null;
  hasSubmitted: boolean;
};

export function ReminderConfigModal({
  open,
  onClose,
  projectId,
  ftmId,
  concernedOrgId,
  orgName,
  initialFreq,
  lastReminderAt,
  dateLimite,
  hasSubmitted,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialMode = (() => {
    if (initialFreq == null || initialFreq === 0) return "0";
    if (PRESETS.some((p) => p.value === initialFreq)) return String(initialFreq);
    return "custom";
  })();

  const [mode, setMode] = useState<string>(initialMode);
  const [customDays, setCustomDays] = useState<string>(
    initialFreq != null && !PRESETS.some((p) => p.value === initialFreq)
      ? String(initialFreq)
      : "",
  );

  if (!open) return null;

  const effectiveFreq: number | null = (() => {
    if (mode === "0") return 0;
    if (mode === "custom") {
      const n = parseInt(customDays, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    return parseInt(mode, 10);
  })();

  const freqUnchanged =
    (effectiveFreq === 0 && (initialFreq == null || initialFreq === 0)) ||
    effectiveFreq === initialFreq;

  function handleSave() {
    setError(null);
    if (mode === "custom" && (!customDays || parseInt(customDays, 10) <= 0)) {
      setError("Indiquez un nombre de jours valide.");
      return;
    }
    const freqToSave = effectiveFreq === 0 ? null : effectiveFreq;
    startTransition(async () => {
      try {
        await updateReminderSettingsAction(concernedOrgId, projectId, ftmId, freqToSave);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleReset() {
    setError(null);
    startTransition(async () => {
      try {
        await resetReminderCadenceAction(concernedOrgId, projectId, ftmId);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const showCadenceTools =
    !hasSubmitted && initialFreq != null && initialFreq > 0;

  return (
    <ModalOverlay onClose={pending ? undefined : onClose}>
      <ModalContainer maxWidth="max-w-md">
        <ModalHeader
          title={
            <>
              Rappels — <span className="text-slate-500">{orgName}</span>
            </>
          }
          icon={<Bell className="h-4 w-4 text-slate-500" />}
          onClose={onClose}
        />

        {/* Context */}
        <div className="mb-4 grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800/40">
          <div>
            <p className="text-slate-500">Statut devis</p>
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {hasSubmitted ? "Soumis" : "En attente"}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Date limite</p>
            <p className="font-medium text-slate-700 dark:text-slate-200">
              {fmtDate(dateLimite)}
            </p>
          </div>
        </div>

        {hasSubmitted && (
          <Alert variant="info" className="mb-4">
            Cette entreprise a déjà soumis un devis. Les rappels ne sont plus envoyés.
          </Alert>
        )}

        {/* Frequency */}
        <fieldset
          className={`mb-4 space-y-2 ${hasSubmitted ? "pointer-events-none opacity-60" : ""}`}
          disabled={hasSubmitted}
        >
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Fréquence des rappels
          </legend>
          <div className="grid gap-1.5">
            {PRESETS.map((p) => (
              <label
                key={p.value}
                className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
              >
                <input
                  type="radio"
                  name="freq-mode"
                  checked={mode === String(p.value)}
                  onChange={() => setMode(String(p.value))}
                  disabled={hasSubmitted}
                />
                <span className="text-slate-700 dark:text-slate-200">{p.label}</span>
              </label>
            ))}
            <label
              className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
            >
              <input
                type="radio"
                name="freq-mode"
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
                disabled={hasSubmitted}
              />
              <span className="text-slate-700 dark:text-slate-200">Personnalisé</span>
              {mode === "custom" && (
                <div className="ml-auto flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="1"
                    value={customDays}
                    onChange={(e) => setCustomDays(e.target.value)}
                    className="w-16 text-xs"
                    disabled={hasSubmitted}
                  />
                  <span className="text-xs text-slate-500">jours</span>
                </div>
              )}
            </label>
          </div>
        </fieldset>

        {/* Cadence tools */}
        {showCadenceTools && (
          <div className="mb-4 space-y-2 rounded border border-slate-200 px-3 py-2 dark:border-slate-700">
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cadence
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500">Dernier rappel</p>
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  {lastReminderAt ? fmtDate(lastReminderAt) : "Jamais"}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Prochain rappel estimé</p>
                <p className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200">
                  <Clock className="h-3 w-3 text-slate-400" />
                  {nextRunEstimate(lastReminderAt, initialFreq)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={pending}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 underline decoration-slate-300 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300 dark:decoration-slate-600 dark:hover:text-slate-100"
            >
              <RotateCw className="h-3 w-3" />
              Réinitialiser la cadence (envoyer dès le prochain run)
            </button>
          </div>
        )}

        {error && (
          <Alert variant="error" className="mb-3">
            {error}
          </Alert>
        )}

        <ModalFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={pending || freqUnchanged || hasSubmitted}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </ModalFooter>
      </ModalContainer>
    </ModalOverlay>
  );
}
