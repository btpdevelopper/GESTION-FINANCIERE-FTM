import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getDgdForOrg } from "@/server/dgd/dgd-queries";
import { calculateDgdTotals } from "@/lib/dgd/calculations";
import { prisma } from "@/lib/prisma";
import { DgdDetailShell } from "../_components/dgd-detail-shell";

export default async function DgdOrgDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; orgId: string }>;
}) {
  const { projectId, orgId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  const [org, dgd, liveTotals] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    getDgdForOrg(projectId, orgId),
    calculateDgdTotals(projectId, orgId),
  ]);
  if (!org) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}/dgd`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← DGD — Vue consolidée
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          DGD — {org.name}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Décompte Général Définitif
        </p>
      </div>

      {!dgd && (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          L&apos;entreprise n&apos;a pas encore créé son Projet de Décompte Final.
        </div>
      )}

      <DgdDetailShell
        projectId={projectId}
        organizationId={orgId}
        dgd={dgd}
        liveTotals={{
          marcheBaseHtCents: Number(liveTotals.marcheBaseHtCents),
          ftmAcceptedTotalHtCents: Number(liveTotals.ftmAcceptedTotalHtCents),
          marcheActualiseHtCents: Number(liveTotals.marcheActualiseHtCents),
          penaltiesTotalHtCents: Number(liveTotals.penaltiesTotalHtCents),
          retenueGarantieCents: Number(liveTotals.retenueGarantieCents),
          cautionBancaireActive: liveTotals.cautionBancaireActive,
          acomptesVersesHtCents: Number(liveTotals.acomptesVersesHtCents),
          soldeDgdHtCents: Number(liveTotals.soldeDgdHtCents),
          lots: liveTotals.lots.map((l) => ({
            lotId: l.lotId,
            lotLabel: l.lotLabel,
            montantMarcheHtCents: Number(l.montantMarcheHtCents),
          })),
        }}
        canCreate={false}
        role={pm.role}
      />
    </div>
  );
}
