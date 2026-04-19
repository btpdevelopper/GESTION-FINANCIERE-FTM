import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getForecast, getForecastIndices } from "@/server/forecast/forecast-queries";
import { getOrgMarcheTotalCents } from "@/server/situations/situation-queries";
import { Capability, ForecastStatus, ProjectRole } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { createNewForecastIndiceAction } from "@/server/forecast/forecast-actions";
import { ForecastEntryEditor } from "./forecast-entry-editor";
import { MoeReviewForm } from "./moe-review-form";
import { MoaValidateForm } from "./moa-validate-form";
import { ForecastTimeline } from "./forecast-timeline";
import { Plus } from "lucide-react";

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const STATUS_LABEL: Record<ForecastStatus, string> = {
  DRAFT:          "Brouillon",
  SUBMITTED:      "Soumis au MOE",
  MOE_CORRECTION: "En correction",
  MOE_APPROVED:   "Approuvé MOE",
  MOA_APPROVED:   "Validé MOA",
  MOE_REFUSED:    "Refusé MOE",
  MOA_REFUSED:    "Refusé MOA",
};

const STATUS_COLOR: Record<ForecastStatus, string> = {
  DRAFT:          "bg-slate-100 text-slate-600",
  SUBMITTED:      "bg-blue-100 text-blue-700",
  MOE_CORRECTION: "bg-amber-100 text-amber-700",
  MOE_APPROVED:   "bg-teal-100 text-teal-700",
  MOA_APPROVED:   "bg-green-100 text-green-700",
  MOE_REFUSED:    "bg-red-100 text-red-700",
  MOA_REFUSED:    "bg-red-100 text-red-700",
};

const TERMINAL = new Set<ForecastStatus>([
  ForecastStatus.MOA_APPROVED,
  ForecastStatus.MOE_REFUSED,
  ForecastStatus.MOA_REFUSED,
]);

export default async function ForecastDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; orgId: string }>;
}) {
  const { projectId, orgId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  if (pm.role === ProjectRole.ENTREPRISE && pm.organizationId !== orgId) notFound();

  const [forecast, indices, marcheTotalBigInt, canSubmit, canMoeReview, canMoaValidate] =
    await Promise.all([
      getForecast(projectId, orgId),
      getForecastIndices(projectId, orgId),
      getOrgMarcheTotalCents(projectId, orgId),
      can(pm.id, Capability.SUBMIT_FORECAST),
      can(pm.id, Capability.REVIEW_FORECAST_MOE),
      can(pm.id, Capability.VALIDATE_FORECAST_MOA),
    ]);
  const marcheTotalCents = Number(marcheTotalBigInt);

  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;

  const isEditable =
    canSubmit &&
    isEntreprise &&
    (!forecast ||
      forecast.status === ForecastStatus.DRAFT ||
      forecast.status === ForecastStatus.MOE_CORRECTION);

  const isCorrection = forecast?.status === ForecastStatus.MOE_CORRECTION;

  const canCreateNewIndice =
    canSubmit &&
    isEntreprise &&
    !!forecast &&
    forecast.status === ForecastStatus.MOA_APPROVED;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <Link
          href={isEntreprise ? `/projects/${projectId}` : `/projects/${projectId}/forecasts`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          {isEntreprise ? "← Tableau de bord" : "← Prévisionnels"}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Prévisionnel — {forecast?.organization?.name ?? orgId}
          </h1>
          {forecast && (
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[forecast.status]}`}
            >
              {STATUS_LABEL[forecast.status]}
            </span>
          )}
        </div>
        {marcheTotalCents > 0 && (
          <p className="mt-0.5 text-xs text-slate-500">
            Montant marché : {formatEur(marcheTotalCents)}
          </p>
        )}
      </div>

      {/* Indice selector */}
      {indices.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {indices.map((idx) => {
            const isActive = forecast?.id === idx.id;
            return (
              <Link
                key={idx.id}
                href={`/projects/${projectId}/forecasts/${orgId}?indice=${idx.indice}`}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-slate-700 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                }`}
              >
                Indice {idx.indice}
                {TERMINAL.has(idx.status) && idx.status === ForecastStatus.MOA_APPROVED && (
                  <span className="ml-1 text-green-600">✓</span>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* No forecast yet + ENTREPRISE */}
      {!forecast && isEntreprise && (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Vous n&apos;avez pas encore de prévisionnel. Renseignez vos entrées ci-dessous pour commencer.
          </p>
        </div>
      )}

      {/* No forecast — MOE/MOA view */}
      {!forecast && !isEntreprise && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Cette entreprise n&apos;a pas encore soumis de prévisionnel.
        </div>
      )}

      {/* Timeline */}
      {forecast && (
        <ForecastTimeline
          status={forecast.status}
          indice={forecast.indice}
          createdAt={forecast.createdAt}
          orgName={forecast.organization?.name ?? null}
          reviews={forecast.reviews}
        />
      )}

      {/* Entries read-only view for non-editable states */}
      {forecast && !isEditable && forecast.entries.length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Entrées du prévisionnel
          </h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="pb-1.5 text-left font-medium text-slate-500">Période</th>
                <th className="pb-1.5 text-right font-medium text-slate-500">Montant HT prévu</th>
              </tr>
            </thead>
            <tbody>
              {forecast.entries.map((e) => {
                const label = /^\d{4}-\d{2}$/.test(e.periodLabel)
                  ? (() => {
                      const [y, m] = e.periodLabel.split("-");
                      const l = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString(
                        "fr-FR",
                        { month: "long", year: "numeric" }
                      );
                      return l.charAt(0).toUpperCase() + l.slice(1);
                    })()
                  : e.periodLabel;
                return (
                  <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 text-slate-700 dark:text-slate-300">{label}</td>
                    <td className="py-1.5 text-right text-slate-700 dark:text-slate-300">
                      {formatEur(Number(e.plannedAmountHtCents))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 dark:border-slate-700">
                <td className="pt-2 font-semibold text-slate-700 dark:text-slate-300">Total</td>
                <td className="pt-2 text-right font-semibold text-slate-800 dark:text-slate-200">
                  {formatEur(
                    forecast.entries.reduce((s, e) => s + Number(e.plannedAmountHtCents), 0)
                  )}
                  {marcheTotalCents > 0 && (
                    <span className="ml-1 font-normal text-slate-400">
                      / {formatEur(marcheTotalCents)}
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Entry editor (DRAFT or MOE_CORRECTION + ENTREPRISE) */}
      {isEditable && (
        <ForecastEntryEditor
          projectId={projectId}
          forecastId={forecast?.id ?? null}
          status={forecast?.status ?? null}
          initialEntries={
            forecast?.entries.map((e) => ({
              periodLabel: e.periodLabel,
              plannedAmountHtCents: Number(e.plannedAmountHtCents),
            })) ?? []
          }
          marcheTotalCents={marcheTotalCents}
          isCorrection={!!isCorrection}
        />
      )}

      {/* MOE review form */}
      {canMoeReview && forecast?.status === ForecastStatus.SUBMITTED && (
        <MoeReviewForm projectId={projectId} forecastId={forecast.id} />
      )}

      {/* MOA validate form */}
      {canMoaValidate && forecast?.status === ForecastStatus.MOE_APPROVED && (
        <MoaValidateForm projectId={projectId} forecastId={forecast.id} />
      )}

      {/* New indice button */}
      {canCreateNewIndice && (
        <form
          action={async () => {
            "use server";
            await createNewForecastIndiceAction({ projectId, organizationId: orgId });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Créer un nouvel indice
          </button>
        </form>
      )}
    </div>
  );
}
