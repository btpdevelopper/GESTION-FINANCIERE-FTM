"use client";

import { useState, useTransition } from "react";
import { X, AlertTriangle, RotateCcw } from "lucide-react";
import { cancelFtmAction, reopenFtmAction } from "@/server/ftm/ftm-actions";
import { useRouter } from "next/navigation";

export function CancelFtmModal({ projectId, ftmId }: { projectId: string; ftmId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
      >
        Abandonner FTM
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Abandonner ce FTM
          </h3>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Cette action annulera définitivement le FTM pour toutes les entreprises concernées et les avertira par email. Veuillez justifier cette annulation.
        </p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Raison de l'annulation (ex: Budget refusé, Doublon...)"
          className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800 mb-4"
          rows={3}
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            disabled={pending || reason.trim().length === 0}
            onClick={() => {
              startTransition(async () => {
                await cancelFtmAction({ projectId, ftmId, reason });
                setIsOpen(false);
                router.refresh();
              });
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Annulation..." : "Confirmer l'abandon"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReopenFtmButton({ projectId, ftmId }: { projectId: string; ftmId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await reopenFtmAction({ projectId, ftmId });
          router.refresh();
        });
      }}
      className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {pending ? "Patientez..." : "Rouvrir le FTM"}
    </button>
  );
}
