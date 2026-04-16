import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound, redirect } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { NewFtmForm } from "./new-ftm-form";
import { FileText, XCircle, CheckCircle2, Clock, Paperclip } from "lucide-react";

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

  // ── Bug #6: If demand is REJECTED, render a read-only historical view ──
  if (demand?.status === "REJECTED") {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/projects/${projectId}/ftms?tab=demandes`} className="text-sm text-slate-600 underline hover:text-slate-900 transition-colors">
          ← Retour aux demandes
        </Link>

        {/* REJECTED Banner */}
        <div className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-6 shadow-sm dark:border-red-900/50 dark:from-red-950/30 dark:to-red-900/10">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-red-900 dark:text-red-200">
                Demande refusée
              </h2>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                Cette demande de l'entreprise <strong>{demand.initiator.organization?.name ?? demand.initiator.user.name}</strong> a été refusée
                {demand.rejectedBy ? (
                  <> par <strong>{demand.rejectedBy.user?.name ?? demand.rejectedBy.user?.email}</strong>{demand.rejectedBy.organization ? <> ({demand.rejectedBy.organization.name})</> : null}</>
                ) : " par la MOE/MOA"}
                {demand.rejectedAt ? (
                  <> le <strong>{new Date(demand.rejectedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</strong></>
                ) : null}.
              </p>
            </div>
          </div>
        </div>

        {/* Original Request Details */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
          <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 dark:bg-slate-800/80 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Détails de la demande initiale
            </h2>
          </div>
          <div className="p-5 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Titre</label>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{demand.title}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Description</label>
              <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                {demand.description}
              </div>
            </div>
            {demand.requestedMoeResponseDate && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Date de réponse souhaitée : <strong className="text-slate-900 dark:text-slate-200">{new Date(demand.requestedMoeResponseDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</strong>
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Soumise par {demand.initiator.organization?.name ?? demand.initiator.user.name ?? demand.initiator.user.email}</span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span>le {new Date(demand.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span>
            </div>
          </div>
        </div>

        {/* Documents */}
        {demand.documents && demand.documents.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60">
            <div className="bg-slate-50/50 px-5 py-4 border-b border-slate-100 dark:bg-slate-800/80 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-slate-500" />
                Documents joints
              </h2>
            </div>
            <div className="p-5 flex flex-col gap-2">
              {demand.documents.map((doc: any) => (
                <div key={doc.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    {doc.name}
                  </span>
                  <a
                    href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Ouvrir
                  </a>
                </div>
              ))}
            </div>
          </div>
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
