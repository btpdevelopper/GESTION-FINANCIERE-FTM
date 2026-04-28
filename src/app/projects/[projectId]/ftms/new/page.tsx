import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound, redirect } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { NewFtmForm } from "./new-ftm-form";
import { FileText, Clock, Paperclip } from "lucide-react";
import { Card, CardSubsection } from "@/components/ui";

export default async function NewFtmPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { projectId } = await params;
  const { demandId } = await searchParams;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  
  const canCreate = await can(pm.id, Capability.CREATE_FTM);
  if (!canCreate && pm.role !== "ENTREPRISE") {
    return (
      <p className="text-sm text-red-600">
        Vous n'avez pas le droit de créer ou demander un FTM sur ce projet.
      </p>
    );
  }

  const orgs = await prisma.organization.findMany({
    where: {
      projectMembers: {
        some: { projectId, role: "ENTREPRISE" },
      },
    },
    orderBy: { name: "asc" },
  });

  let demand: any = null;
  if (demandId && typeof demandId === "string") {
     demand = await prisma.ftmDemand.findUnique({
        where: { id: demandId },
        include: {
          documents: true,
          initiator: { include: { organization: true, user: true } },
          rejectedBy: { include: { organization: true, user: true } },
          ftmRecords: { select: { id: true, number: true } },
        }
     });
  }

  // ── Bug #1: If demand is APPROVED and already has an FTM, redirect to the FTM detail ──
  if (demand?.status === "APPROVED" && demand.ftmRecords?.length > 0) {
    redirect(`/projects/${projectId}/ftms/${demand.ftmRecords[0].id}`);
  }

  // ── If demand is REJECTED, render a read-only historical view ──
  if (demand?.status === "REJECTED") {
    const rejecter =
      demand.rejectedBy?.user?.name ?? demand.rejectedBy?.user?.email ?? "MOE/MOA";
    const rejecterOrg = demand.rejectedBy?.organization?.name ?? null;
    const submitter =
      demand.initiator.organization?.name ??
      demand.initiator.user.name ??
      demand.initiator.user.email;
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Link
          href={`/projects/${projectId}/ftms?tab=demandes`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Retour aux demandes
        </Link>

        {/* Status header (dot + inline metadata) */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              Refusée
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Refusée par{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {rejecter}
            </span>
            {rejecterOrg && (
              <span className="text-slate-400 dark:text-slate-500"> ({rejecterOrg})</span>
            )}
            {demand.rejectedAt && (
              <>
                {" "}le{" "}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {new Date(demand.rejectedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Rejection comment */}
        {demand.rejectionComment && (
          <Card className="border-l-2 border-l-red-400 p-4 dark:border-l-red-500/70">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Motif du refus
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
              {demand.rejectionComment}
            </p>
          </Card>
        )}

        {/* Original Request Details */}
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
            <FileText className="h-3.5 w-3.5 text-slate-500" />
            Détails de la demande initiale
          </h2>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Titre
              </p>
              <p className="text-sm text-slate-900 dark:text-slate-100">{demand.title}</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Description
              </p>
              <CardSubsection className="whitespace-pre-wrap p-3 text-sm text-slate-700 dark:text-slate-300">
                {demand.description}
              </CardSubsection>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              {demand.requestedMoeResponseDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <span className="font-medium">Réponse souhaitée :</span>{" "}
                  {new Date(demand.requestedMoeResponseDate).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>Soumise par <span className="font-medium text-slate-700 dark:text-slate-200">{submitter}</span></span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>
                le{" "}
                {new Date(demand.createdAt).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </Card>

        {/* Documents */}
        {demand.documents && demand.documents.length > 0 && (
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <Paperclip className="h-3.5 w-3.5 text-slate-500" />
              Documents joints
            </h2>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {demand.documents.map((doc: any) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate text-slate-700 dark:text-slate-300">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{doc.name}</span>
                  </span>
                  <a
                    href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    Ouvrir
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/projects/${projectId}/ftms`} className="text-sm text-slate-600 underline hover:text-slate-900 transition-colors">
        ← Tableau des FTM
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {demand ? "Instruire la demande" : "Nouveau FTM"}
        </h1>
      </div>
      
      {demand && pm.role !== "ENTREPRISE" && (
         <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/50 dark:bg-blue-900/20 mb-8">
            <h2 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Référence : Demande de {demand.initiator.organization?.name ?? demand.initiator.user.name}
            </h2>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">Titre : {demand.title}</p>
            <div className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-wrap">
               {demand.description}
            </div>
            {demand.documents && demand.documents.length > 0 && (
               <div className="mt-4">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase mb-2">Pièces jointes</p>
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                     {demand.documents.map((doc: any) => (
                        <li key={doc.id} className="col-span-1 rounded-lg bg-white shadow-sm flex items-center justify-between py-2.5 px-3 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 group">
                            <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              {doc.name}
                            </span>
                            <a
                              href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-200 transition-colors dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                            >
                              Ouvrir
                            </a>
                        </li>
                     ))}
                  </ul>
               </div>
            )}
         </div>
      )}

      <NewFtmForm
        projectId={projectId}
        role={pm.role}
        userOrgId={pm.organizationId}
        orgs={orgs}
        demandId={demand ? demand.id : undefined}
        initialTitle={demand?.title}
        initialDescription={demand?.description}
        initialDate={demand?.requestedMoeResponseDate ? new Date(demand.requestedMoeResponseDate).toISOString().split("T")[0] : undefined}
        initialFiles={demand?.documents?.map((d: any) => ({ id: d.id, name: d.name }))}
        demandStatus={demand?.status}
      />
    </div>
  );
}
