"use client";

import { useState, useTransition } from "react";
import { Settings, Wallet, MapPin, Calendar, Check } from "lucide-react";
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
    address: string | null;
    city: string | null;
    postalCode: string | null;
    startDate: Date | string | null;
    endDate: Date | string | null;
    baseContract: { amountHtCents: bigint | string } | null;
  };
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code ?? "");
  const [address, setAddress] = useState(project.address ?? "");
  const [city, setCity] = useState(project.city ?? "");
  const [postalCode, setPostalCode] = useState(project.postalCode ?? "");
  const [startDate, setStartDate] = useState(
    project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "",
  );
  const [endDate, setEndDate] = useState(
    project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    name !== project.name ||
    code !== (project.code ?? "") ||
    address !== (project.address ?? "") ||
    city !== (project.city ?? "") ||
    postalCode !== (project.postalCode ?? "") ||
    startDate !== (project.startDate ? new Date(project.startDate).toISOString().split("T")[0] : "") ||
    endDate !== (project.endDate ? new Date(project.endDate).toISOString().split("T")[0] : "");

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
        await updateProjectAction({
          projectId: project.id,
          name,
          code,
          address,
          city,
          postalCode,
          startDate: startDate || null,
          endDate: endDate || null,
        });
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

        {/* Address */}
        <div className="mt-4 flex items-center gap-2 mb-3">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Adresse du chantier</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Adresse
            </label>
            <Input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="N° et nom de rue"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Code postal
            </label>
            <Input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="75001"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Ville
            </label>
            <Input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Paris"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="mt-4 flex items-center gap-2 mb-3">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dates du projet</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Date de début
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Date de fin prévisionnelle
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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
