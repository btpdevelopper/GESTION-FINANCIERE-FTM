"use client";

import { useTransition } from "react";
import { setForecastWaivedAction } from "@/server/forecast/forecast-actions";
import { useRouter } from "next/navigation";

export function SetForecastWaivedButton({
  projectId,
  organizationId,
  waived,
}: {
  projectId: string;
  organizationId: string;
  waived: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    startTransition(async () => {
      try {
        await setForecastWaivedAction({ projectId, organizationId, waived: !waived });
        router.refresh();
      } catch {
        // silently ignore — page will re-render with current state
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`w-full rounded border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        waived
          ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
      }`}
    >
      {isPending
        ? "…"
        : waived
        ? "Réactiver l'obligation de prévisionnel"
        : "Dispenser du prévisionnel"}
    </button>
  );
}
