"use client";

import { useState, useTransition } from "react";
import { Settings, Check } from "lucide-react";
import { updateProjectAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

const FIELD_LABEL_CLS =
  "mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400";

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
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Informations du projet
          </h2>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/60">
          <span className="text-slate-500 dark:text-slate-400">Marché de base</span>
          <span className="ml-1.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {baseAmount ?? "Non défini"}
          </span>
          {baseAmount && (
            <span className="ml-1 text-slate-500 dark:text-slate-400">HT</span>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-12">
        <div className="sm:col-span-7">
          <label className={FIELD_LABEL_CLS}>
            Nom du projet <span className="text-red-500">*</span>
          </label>
          <Input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="sm:col-span-5">
          <label className={FIELD_LABEL_CLS}>Code projet</label>
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="PROJ-2026-001"
          />
        </div>

        <div className="sm:col-span-12">
          <label className={FIELD_LABEL_CLS}>Adresse du chantier</label>
          <Input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="N° et nom de rue"
          />
        </div>

        <div className="sm:col-span-3">
          <label className={FIELD_LABEL_CLS}>Code postal</label>
          <Input
            type="text"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            placeholder="75001"
          />
        </div>
        <div className="sm:col-span-9">
          <label className={FIELD_LABEL_CLS}>Ville</label>
          <Input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Paris"
          />
        </div>

        <div className="sm:col-span-6">
          <label className={FIELD_LABEL_CLS}>Date de début</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="sm:col-span-6">
          <label className={FIELD_LABEL_CLS}>Date de fin prévisionnelle</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      {error && <Alert variant="error" className="mt-3">{error}</Alert>}

      <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
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
  );
}
