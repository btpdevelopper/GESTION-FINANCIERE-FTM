"use client";

import { useState, useTransition } from "react";
import { Settings, Wallet, Check } from "lucide-react";
import { updateProjectAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

export function TabGeneral({
  project,
}: {
  project: {
    id: string;
    name: string;
    code: string | null;
    baseContract: { amountHtCents: bigint | string } | null;
  };
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = name !== project.name || code !== (project.code ?? "");

  const baseAmount = project.baseContract
    ? (Number(BigInt(project.baseContract.amountHtCents.toString())) / 100).toLocaleString(
        "fr-FR",
        { style: "currency", currency: "EUR" },
      )
    : null;

  const submit = () => {
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError("Le nom du projet est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProjectAction({ projectId: project.id, name, code });
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Informations du projet
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Nom du projet <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Code projet
            </label>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: PROJ-2026-001"
            />
          </div>
        </div>

        {error && <Alert variant="error" className="mt-3">{error}</Alert>}

        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Modifications enregistrées
            </span>
          )}
          <Button onClick={submit} disabled={pending || !dirty}>
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Marché de base</h2>
        </div>
        <p className="text-xs text-slate-500">
          Calculé automatiquement à partir des montants HT assignés aux entreprises dans chaque lot.
        </p>
        <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {baseAmount ?? (
            <span className="text-base font-medium text-slate-400">Non défini</span>
          )}
          {baseAmount && (
            <span className="ml-2 text-sm font-medium text-slate-500">HT</span>
          )}
        </p>
      </Card>
    </div>
  );
}
