import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import {
  ProjectRole,
  FtmPhase,
  MoaEtudesDecision,
  Capability,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { getFtmDetail } from "@/server/ftm/queries";
import { resolveCapabilities } from "@/lib/permissions/resolve";
import {
  saveEtudesAction,
  moaDecideEtudesAction,
  openQuotingAction,
  postFtmChatAction,
  submitQuoteAction,
  moeAnalyzeQuoteAction,
  moaFinalQuoteAction,
  setDesignatedMoaValidatorAction,
  uploadFtmDocumentAction,
  deleteFtmDocumentAction,
} from "@/server/ftm/ftm-actions";
import { getFtmDocumentUrl } from "@/lib/storage";
import { EtudesParticipantsModal } from "./etudes-participants-modal";
import { FtmActionButton } from "./ftm-action-buttons";
import { FtmDetailShell } from "./ftm-detail-shell";
import { QuoteTrackingDashboard } from "./quote-tracking-dashboard";
import { FtmQuoteHistory } from "./ftm-quote-history";
import { X } from "lucide-react";
import { MoaValidatorDropdown } from "./moa-validator-dropdown";
import { EntrepriseEtudesDashboard } from "./entreprise-etudes-dashboard";
import { CancelFtmModal, ReopenFtmButton } from "./cancel-ftm-modal";
import { EtudesLotsEditor } from "./etudes-lots-editor";
import { FtmThreadChat } from "./ftm-thread-chat";
import { CompanyDemandContext } from "./company-demand-context";

export default async function FtmDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; ftmId: string }>;
}) {
  const { projectId, ftmId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  const ftm = await getFtmDetail(projectId, ftmId, pm);

  const caps = await resolveCapabilities(pm.id);
  const moaMembers = await prisma.projectMember.findMany({
    where: { projectId, role: ProjectRole.MOA },
    include: { user: true, organization: true },
  });
  // MOE + MOA members for études participant assignment
  const moeMoaMembers = await prisma.projectMember.findMany({
    where: { projectId, role: { in: [ProjectRole.MOE, ProjectRole.MOA] } },
    include: { user: true, organization: true },
  });

  const allOrgs = await prisma.organization.findMany({
    where: { projectMembers: { some: { projectId } } },
    select: { id: true, name: true },
  });

  const latestSubmissionsMap = new Map<string, typeof ftm.quoteSubmissions[0]>();
  for (const q of ftm.quoteSubmissions) {
    if (!latestSubmissionsMap.has(q.organizationId)) {
      latestSubmissionsMap.set(q.organizationId, q);
    }
  }
  const latestSubmissions = Array.from(latestSubmissionsMap.values());
  const myLot = ftm.lots.find((l) => l.organizationId === pm.organizationId);

  // ── Precompute Études sub-step states ──
  const isPastEtudes = ftm.phase !== FtmPhase.ETUDES;
  const hasDescription = !!ftm.etudesDescription;
  const isEtudesApproved = ftm.moaEtudesDecision === MoaEtudesDecision.APPROVED;
  // Documents become read-only once the MOE has submitted for MOA review (mirrors EtudesLotsEditor.isLocked).
  // The lock is only lifted if the MOA explicitly declines, sending it back for revision.
  const isEtudesDocumentsLocked = isPastEtudes || (hasDescription && ftm.moaEtudesDecision !== "DECLINED");

  // ── Precompute ENTREPRISE quote eligibility ──
  const mySub = latestSubmissions.find((s) => s.organizationId === pm.organizationId);
  const myReview = mySub?.reviews?.[0];
  const canSubmitQuote =
    (ftm.phase === FtmPhase.QUOTING || ftm.phase === FtmPhase.ANALYSIS) &&
    pm.role === ProjectRole.ENTREPRISE &&
    myLot &&
    caps[Capability.SUBMIT_QUOTE] &&
    (!mySub || myReview?.decision === "RESEND_CORRECTION");


  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-20">
      {/* ── Top Navigation Return ── */}
      <div className="pt-2">
        <Link
          href={`/projects/${projectId}/ftms`}
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-slate-300"
        >
          &larr; Retour aux FTM
        </Link>
      </div>

      <FtmDetailShell
        ftm={ftm}
        headerSection={
          <div className="mb-6 flex flex-col gap-4">
            {ftm.phase === FtmPhase.CANCELLED && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400">
                    <X className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                      FTM {ftm.preCancellationPhase ? "Abandonné" : "Annulé"} par {ftm.cancelledBy?.user?.name || ftm.cancelledBy?.user?.email || "l'Administration"} {ftm.cancelledAt && `le ${new Date(ftm.cancelledAt).toLocaleDateString("fr-FR")}`}
                    </h3>
                    {ftm.cancellationReason && (
                      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                        Motif : {ftm.cancellationReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Bug #3: Company Demand Context (role-scoped) ── */}
            {ftm.fromDemand && (() => {
              const demandInitiatorOrgId = ftm.fromDemand.initiator?.organizationId;
              const isViewerMoeMoa = pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA;
              const isViewerDemandInitiator = pm.organizationId === demandInitiatorOrgId;
              const canSeeDemandContext = isViewerMoeMoa || isViewerDemandInitiator;

              if (!canSeeDemandContext) return null;

              return (
                <CompanyDemandContext
                  companyName={ftm.fromDemand.initiator?.organization?.name ?? ftm.fromDemand.initiator?.user?.name ?? "Entreprise"}
                  description={ftm.fromDemand.description}
                  documents={(ftm.fromDemand.documents ?? []).map((d: any) => ({ id: d.id, name: d.name, url: d.url }))}
                  requestedDate={ftm.fromDemand.requestedMoeResponseDate}
                />
              );
            })()}

            <div className="flex flex-col items-start justify-between gap-4 md:flex-row">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-slate-100 px-2 py-1 font-mono text-sm font-semibold tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    FTM N°{ftm.number}
                  </span>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white md:text-2xl">
                    {ftm.title}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span>
                    Source : <strong className="font-medium text-slate-700 dark:text-slate-300">{ftm.modificationSource}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600">•</span>
                  <span>Créé le {new Date(ftm.createdAt).toLocaleDateString("fr-FR")}</span>
                  {ftm.initiator?.organization?.name && (
                    <span className="flex items-center gap-2">
                      <span className="text-slate-300 dark:text-slate-600">•</span>
                      <span>
                        Initié par <strong className="font-medium text-slate-700 dark:text-slate-300">{ftm.initiator.organization.name}</strong>
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-2">
                {ftm.phase === FtmPhase.CANCELLED && (pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) && (
                  <ReopenFtmButton projectId={projectId} ftmId={ftmId} />
                )}
                {ftm.phase !== FtmPhase.CANCELLED && ftm.phase !== FtmPhase.ACCEPTED && (pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) && (
                  <CancelFtmModal projectId={projectId} ftmId={ftmId} />
                )}
                {caps[Capability.ADMIN_PROJECT_PERMISSIONS] && (
                  <MoaValidatorDropdown
                    projectId={projectId}
                    ftmId={ftmId}
                    currentValidatorId={ftm.designatedMoaValidatorId}
                    moaMembers={moaMembers}
                  />
                )}
              </div>
            </div>
          </div>
        }
        tabContent={{
          /* ────────────────────────────────────
           *  TAB 1: ÉTUDES (guided sub-steps)
           * ──────────────────────────────────── */
          ETUDES: pm.role === ProjectRole.ENTREPRISE ? (
            <EntrepriseEtudesDashboard ftm={ftm} myLot={myLot} projectId={projectId} />
          ) : (
            <div className="flex flex-col gap-8">
              {/* Step 1: Rédaction */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                      1
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Rédaction des études
                    </h3>
                    {hasDescription && isPastEtudes && (
                      <span className="text-xs text-slate-400 font-medium">
                        Verrouillé
                      </span>
                    )}
                  </div>
                  {caps[Capability.INVITE_ETUDES_PARTICIPANT] && !isPastEtudes && (
                    <EtudesParticipantsModal
                      projectId={projectId}
                      ftmId={ftmId}
                      invitations={ftm.invitations.map((inv) => ({
                        ...inv,
                        createdAt: inv.createdAt.toISOString(),
                        expiresAt: inv.expiresAt.toISOString(),
                        consumedAt: inv.consumedAt?.toISOString() ?? null,
                      }))}
                      projectMembers={moeMoaMembers}
                    />
                  )}
                </div>
                {(pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
                  caps[Capability.EDIT_ETUDES] ? (
                  <EtudesLotsEditor
                    projectId={projectId}
                    ftmId={ftmId}
                    globalDescription={ftm.etudesDescription ?? ""}
                    lots={ftm.lots as any}
                    concernedOrgs={ftm.concernedOrgs}
                    allOrgs={allOrgs}
                    isLocked={isPastEtudes || (hasDescription && ftm.moaEtudesDecision !== "DECLINED")}
                  />
                ) : (
                  <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600 whitespace-pre-wrap dark:bg-slate-800/60 dark:text-slate-300">
                    {ftm.etudesDescription || "Aucune étude renseignée."}
                  </div>
                )}

                {/* Inline contributions from participants */}
                {ftm.invitations.filter((inv) => inv.contribution).length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    {ftm.invitations
                      .filter((inv) => inv.contribution)
                      .map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              Contribution de {inv.email}
                            </span>
                            <span className="text-slate-400">
                              {inv.consumedAt
                                ? new Date(inv.consumedAt).toLocaleDateString(
                                  "fr-FR",
                                  { day: "2-digit", month: "short", year: "numeric" }
                                )
                                : ""}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap dark:text-slate-300">
                            {inv.contribution}
                          </p>
                        </div>
                      ))}
                  </div>
                )}
              </section>

              {/* Documents Section */}
              <section className="border-t border-slate-100 pt-6 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                  Documents
                </h3>

                {/* Upload form — MOE/MOA during ETUDES only, hidden once submitted for MOA review */}
                {(pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
                  caps[Capability.EDIT_ETUDES] &&
                  ftm.phase === FtmPhase.ETUDES &&
                  !isEtudesDocumentsLocked && (
                    <form
                      action={async (fd) => {
                        "use server";
                        await uploadFtmDocumentAction(fd);
                      }}
                      className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="ftmId" value={ftmId} />
                      <div className="flex flex-col text-sm">
                        <label className="mb-1 text-xs font-medium text-slate-500">Fichier</label>
                        <input
                          type="file"
                          name="file"
                          required
                          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white dark:file:bg-slate-100 dark:file:text-slate-900"
                        />
                      </div>
                      <div className="flex flex-col text-sm">
                        <label className="mb-1 text-xs font-medium text-slate-500">Visibilité</label>
                        <select
                          name="organizationId"
                          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="">Document général</option>
                          {ftm.concernedOrgs.map((c: any) => (
                            <option key={c.organizationId} value={c.organizationId}>
                              {c.organization.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                      >
                        Uploader
                      </button>
                    </form>
                  )}

                {/* Document list */}
                {(() => {
                  const generalDocs = ftm.documents.filter((d: any) => !d.organizationId);
                  const orgGroups = new Map<string, { orgName: string; docs: any[] }>();
                  for (const d of ftm.documents) {
                    if (d.organizationId && d.organization) {
                      if (!orgGroups.has(d.organizationId)) {
                        orgGroups.set(d.organizationId, { orgName: d.organization.name, docs: [] });
                      }
                      orgGroups.get(d.organizationId)!.docs.push(d);
                    }
                  }

                  const canDelete =
                    (pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
                    caps[Capability.EDIT_ETUDES] &&
                    !isEtudesDocumentsLocked;

                  const renderDoc = (doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{doc.name}</span>
                        <span className="text-xs text-slate-400">
                          Par {doc.uploadedBy?.name ?? doc.uploadedBy?.email ?? "Inconnu"} le{" "}
                          {new Date(doc.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          Ouvrir
                        </a>
                        {canDelete && (
                          <form
                            action={async () => {
                              "use server";
                              await deleteFtmDocumentAction({ projectId, ftmId, documentId: doc.id });
                            }}
                          >
                            <button
                              type="submit"
                              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400"
                            >
                              Supprimer
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  );

                  if (generalDocs.length === 0 && orgGroups.size === 0) {
                    return <p className="text-sm text-slate-400">Aucun document.</p>;
                  }

                  return (
                    <div className="flex flex-col gap-4">
                      {generalDocs.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Documents généraux</h4>
                          <div className="flex flex-col gap-1.5">{generalDocs.map(renderDoc)}</div>
                        </div>
                      )}
                      {Array.from(orgGroups.entries()).map(([orgId, { orgName, docs }]) => (
                        <div key={orgId}>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{orgName}</h4>
                          <div className="flex flex-col gap-1.5">{docs.map(renderDoc)}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </section>

              {/* Step 2: Validation MOA */}
              <section
                className={`transition-opacity duration-200 ${!hasDescription ? "pointer-events-none opacity-40" : ""
                  }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isEtudesApproved
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : hasDescription
                        ? "border-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                        : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                      }`}
                  >
                    2
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Validation MOA
                  </h3>
                </div>

                {!hasDescription && (
                  <p className="text-sm text-slate-400">
                    En attente de la rédaction des études.
                  </p>
                )}

                {hasDescription &&
                  !isEtudesApproved &&
                  ftm.moaEtudesDecision === MoaEtudesDecision.PENDING &&
                  pm.role === ProjectRole.MOA &&
                  caps[Capability.VALIDATE_ETUDES_MOA] && (
                    <form
                      action={async (fd) => {
                        "use server";
                        await moaDecideEtudesAction({
                          projectId,
                          ftmId,
                          decision:
                            fd.get("decision") === "APPROVED"
                              ? "APPROVED"
                              : "DECLINED",
                          comment: String(fd.get("comment") ?? ""),
                        });
                      }}
                      className="flex flex-col gap-3"
                    >
                      <textarea
                        name="comment"
                        placeholder="Commentaire éventuel..."
                        rows={2}
                        className="rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          name="decision"
                          value="APPROVED"
                          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                        >
                          Approuver les études
                        </button>
                        <button
                          type="submit"
                          name="decision"
                          value="DECLINED"
                          className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400"
                        >
                          Refuser
                        </button>
                      </div>
                    </form>
                  )}

                {hasDescription &&
                  ftm.moaEtudesDecision === MoaEtudesDecision.PENDING &&
                  (pm.role !== ProjectRole.MOA ||
                    !caps[Capability.VALIDATE_ETUDES_MOA]) && (
                    <p className="text-sm text-slate-500">
                      En attente de l'instruction du MOA.
                    </p>
                  )}

                {isEtudesApproved && (
                  <div className="rounded-md bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Études approuvées par le MOA
                  </div>
                )}
              </section>

              {/* Step 3: Deadlines & Open Quoting */}
              <section
                className={`transition-opacity duration-200 ${!isEtudesApproved ? "pointer-events-none opacity-40" : ""
                  }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${isPastEtudes
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : isEtudesApproved
                        ? "border-2 border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                        : "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500"
                      }`}
                  >
                    3
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Délais et ouverture devis
                  </h3>
                </div>

                {!isEtudesApproved && (
                  <p className="text-sm text-slate-400">
                    Accessible une fois les études validées par le MOA.
                  </p>
                )}

                {isEtudesApproved &&
                  !isPastEtudes &&
                  (pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
                  (caps[Capability.SET_DEADLINES_AFTER_ETUDES] ||
                    caps[Capability.VALIDATE_ETUDES_MOA]) && (
                    <form
                      action={async () => {
                        "use server";
                        await openQuotingAction({
                          projectId,
                          ftmId,
                        });
                      }}
                      className="flex flex-col gap-4"
                    >
                      <p className="text-sm text-slate-500">
                        Cette action verrouille les études et ouvre la phase de chiffrage pour toutes les entreprises concernées.
                      </p>
                      <button
                        type="submit"
                        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        Ouvrir la phase Devis
                      </button>
                    </form>
                  )}

                {isPastEtudes && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      Phase devis ouverte. Délais configurés :
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ftm.concernedOrgs.map((c: any) => (
                        <div
                          key={c.id}
                          className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60"
                        >
                          <div className="text-xs font-medium text-slate-500">
                            {c.organization.name}
                          </div>
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {c.dateLimiteDevis
                              ? new Date(c.dateLimiteDevis).toLocaleString(
                                "fr-FR",
                                { dateStyle: "short", timeStyle: "short" }
                              )
                              : "Aucun délai"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          ),

          /* ────────────────────────────────────
           *  TAB 3: DEVIS
           * ──────────────────────────────────── */
          QUOTING: (
            <div className="flex flex-col gap-6">
              {/* MOE/MOA Tracking Dashboard */}
              <QuoteTrackingDashboard
                ftm={ftm}
                pm={pm}
                latestSubmissions={latestSubmissions}
                projectId={projectId}
              />

              {/* ENTREPRISE Quote Submission */}
              {pm.role === ProjectRole.ENTREPRISE &&
                myLot &&
                caps[Capability.SUBMIT_QUOTE] && (
                  <div className="w-full">
                    {canSubmitQuote ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/50">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Soumettre votre devis
                        </h4>
                        {myReview?.decision === "RESEND_CORRECTION" && (
                          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            Renvoyé pour correction : {myReview.comment}
                          </div>
                        )}
                        <form
                          action={async (fd) => {
                            "use server";
                            fd.set("projectId", projectId);
                            fd.set("ftmId", ftmId);
                            fd.set("ftmLotId", myLot.id);
                            fd.set("organizationId", pm.organizationId);

                            const amt = fd.get("amountHt") as string;
                            const cents = BigInt(Math.round(parseFloat((amt || "0").replace(",", ".")) * 100));
                            fd.set("amountHtCents", cents.toString());

                            await submitQuoteAction(fd);
                          }}
                          className="mt-4 flex flex-col gap-4"
                        >
                          <div className="flex flex-wrap items-end gap-3 cursor-pointer">
                            <div className="flex-1 min-w-[150px] max-w-[200px]">
                              <input
                                name="quoteNumber"
                                type="text"
                                required
                                placeholder="N° Devis"
                                className="w-full rounded-md border border-slate-200 bg-white py-2 px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                            </div>
                            <div className="relative flex-1 min-w-[150px] max-w-sm">
                              <input
                                name="amountHt"
                                type="text"
                                required
                                placeholder="Montant HT"
                                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                              />
                              <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-slate-400">
                                EUR
                              </span>
                            </div>
                            <div className="flex-1 min-w-[250px]">
                              <input
                                type="file"
                                name="file"
                                required
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                                className="block w-full text-sm text-slate-500 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-300 dark:hover:file:bg-slate-700"
                              />
                            </div>
                          </div>
                          <div>
                            <button
                              type="submit"
                              className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                            >
                              Transmettre le devis
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : mySub ? (
                      /* Company has a real submission on record — show confirmation */
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/30">
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Devis soumis
                        </h4>
                        <div className="mt-1 flex flex-col gap-2">
                          <p className="text-sm text-slate-500">
                            Votre devis a bien été transmis. Vous serez notifié des
                            retours.
                          </p>
                          {mySub?.documentUrl && (
                            <a href={`/api/ftm-doc?path=${encodeURIComponent(mySub.documentUrl)}`} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-max items-center rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700">
                              📄 Télécharger votre devis joint
                            </a>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Phase not open yet — quoting has not been unlocked */
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/30">
                        <p className="text-sm text-slate-400">
                          La phase de chiffrage n&apos;est pas encore ouverte. Vous serez notifié dès que le MOE l&apos;aura activée.
                        </p>
                      </div>
                    )}
                  </div>
                )}

              {/* Chat */}
              <FtmThreadChat
                projectId={projectId}
                ftmId={ftmId}
                messages={ftm.chatMessages}
                concernedOrgs={ftm.concernedOrgs}
                pmRole={pm.role}
                pmId={pm.id}
                capabilities={caps}
                isQuotingOpen={isPastEtudes}
              />

            </div>
          ),

          /* ────────────────────────────────────
           *  TAB 4: ANALYSE MOE
           * ──────────────────────────────────── */
          ANALYSIS: (() => {
            const canActMoe = pm.role === ProjectRole.MOE && caps[Capability.ANALYZE_QUOTE_MOE];

            return (
              <div className="flex flex-col gap-4">
                {latestSubmissions.length === 0 && (
                  <p className="text-sm text-slate-400">Aucun devis soumis pour le moment.</p>
                )}
                {latestSubmissions.map((sub) => {
                  const showSensitiveStats = pm.role !== ProjectRole.ENTREPRISE || pm.organizationId === sub.organizationId;
                  const moeReview = sub.reviews.find((r: any) => r.context === "MOE_ANALYSIS");
                  const decisionBadge = (d: string) => {
                    const map: Record<string, { label: string; cls: string }> = {
                      ACCEPT: { label: "Favorable", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
                      DECLINE: { label: "Défavorable", cls: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
                      RESEND_CORRECTION: { label: "Renvoyé", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
                    };
                    const info = map[d] ?? { label: d, cls: "bg-slate-100 text-slate-600" };
                    return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${info.cls}`}>{info.label}</span>;
                  };

                  return (
                    <div
                      key={sub.id}
                      className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {sub.organization.name}
                            </h4>
                            {moeReview ? decisionBadge(moeReview.decision) : (
                              <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">En attente</span>
                            )}
                          </div>
                          {sub.documentUrl && (
                            <a href={`/api/ftm-doc?path=${encodeURIComponent(sub.documentUrl)}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center text-xs font-medium text-slate-600 underline decoration-slate-300 hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200">
                              Télécharger le devis {sub.documentName && `(${sub.documentName})`}
                            </a>
                          )}
                        </div>
                        {showSensitiveStats && (
                          <div className="text-right">
                            <div className="text-base font-bold text-slate-900 dark:text-white">
                              {(Number(sub.amountHtCents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT
                            </div>
                            <div className="text-xs text-slate-400">Indice {sub.indice} — Soumis le {new Date(sub.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          </div>
                        )}
                      </div>

                      {/* Existing MOE review detail */}
                      {moeReview && (
                        <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {moeReview.reviewer.user.name ?? moeReview.reviewer.user.email}
                            </span>
                            <span className="text-slate-400">
                              {new Date(moeReview.decidedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          {moeReview.comment && (
                            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{moeReview.comment}</p>
                          )}
                        </div>
                      )}

                      {/* Action form — only for MOE without existing review */}
                      {!moeReview && canActMoe && (
                        <form
                          className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"
                          action={async (fd) => {
                            "use server";
                            const decision = fd.get("decision") as "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
                            const scope = fd.get("declineScope") as "WHOLE_FTM" | "THIS_COMPANY_ONLY" | null;
                            await moeAnalyzeQuoteAction({
                              projectId, ftmId,
                              quoteSubmissionId: sub.id,
                              decision,
                              comment: String(fd.get("comment") ?? ""),
                              declineScope: decision === "DECLINE" ? scope ?? undefined : undefined,
                            });
                          }}
                        >
                          <textarea
                            name="comment" required placeholder="Avis motivé..." rows={2}
                            className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="submit" name="decision" value="ACCEPT" className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">Favorable</button>
                            <button type="submit" name="decision" value="RESEND_CORRECTION" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Renvoyer pour correction</button>
                            <button type="submit" name="decision" value="DECLINE" className="rounded-md border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400">Défavorable</button>
                            <select name="declineScope" title="Périmètre de refus" className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
                              <option value="WHOLE_FTM">Annuler le FTM</option>
                              <option value="THIS_COMPANY_ONLY">Exclure cette entreprise</option>
                            </select>
                          </div>
                        </form>
                      )}

                      {!moeReview && !canActMoe && (
                        <div className="mt-3 text-sm text-slate-400">En attente d'analyse MOE.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })(),

          /* ────────────────────────────────────
           *  TAB 5: VALIDATION MOA
           * ──────────────────────────────────── */
          MOA_FINAL: (() => {
            const canActMoa = pm.role === ProjectRole.MOA && caps[Capability.FINAL_VALIDATE_QUOTE_MOA];

            return (
              <div className="flex flex-col gap-4">
                {latestSubmissions.length === 0 && (
                  <p className="text-sm text-slate-400">Aucun devis soumis.</p>
                )}
                {latestSubmissions.map((sub) => {
                  const showSensitiveStats = pm.role !== ProjectRole.ENTREPRISE || pm.organizationId === sub.organizationId;
                  const moeReview = sub.reviews.find((r: any) => r.context === "MOE_ANALYSIS");
                  const moaReview = sub.reviews.find((r: any) => r.context === "MOA_FINAL_QUOTE");
                  const decisionBadge = (d: string) => {
                    const map: Record<string, { label: string; cls: string }> = {
                      ACCEPT: { label: "Accepté", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
                      DECLINE: { label: "Refusé", cls: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
                      RESEND_CORRECTION: { label: "Correction", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
                    };
                    const info = map[d] ?? { label: d, cls: "bg-slate-100 text-slate-600" };
                    return <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${info.cls}`}>{info.label}</span>;
                  };

                  return (
                    <div
                      key={sub.id}
                      className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/50"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2.5">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {sub.organization.name}
                            </h4>
                            {moaReview ? decisionBadge(moaReview.decision) : (
                              <span className="rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">En attente</span>
                            )}
                          </div>
                          {sub.documentUrl && (
                            <a href={`/api/ftm-doc?path=${encodeURIComponent(sub.documentUrl)}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center text-xs font-medium text-slate-600 underline decoration-slate-300 hover:text-slate-900 dark:text-slate-400 dark:decoration-slate-600 dark:hover:text-slate-200">
                              Télécharger le devis {sub.documentName && `(${sub.documentName})`}
                            </a>
                          )}
                        </div>
                        {showSensitiveStats && (
                          <div className="text-right">
                            <div className="text-base font-bold text-slate-900 dark:text-white">
                              {(Number(sub.amountHtCents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} HT
                            </div>
                            <div className="text-xs text-slate-400">Indice {sub.indice} — {new Date(sub.submittedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          </div>
                        )}
                      </div>

                      {/* MOE review context (read-only for MOA) */}
                      {moeReview && (
                        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/60">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Avis MOE</span>
                            {decisionBadge(moeReview.decision)}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {moeReview.reviewer.user.name ?? moeReview.reviewer.user.email}
                            </span>
                            <span className="text-slate-400">
                              {new Date(moeReview.decidedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          {moeReview.comment && (
                            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{moeReview.comment}</p>
                          )}
                        </div>
                      )}

                      {/* Existing MOA review detail */}
                      {moaReview && (
                        <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-500 dark:text-slate-400">Avis MOA</span>
                            {decisionBadge(moaReview.decision)}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-600 dark:text-slate-300">
                              {moaReview.reviewer.user.name ?? moaReview.reviewer.user.email}
                            </span>
                            <span className="text-slate-400">
                              {new Date(moaReview.decidedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          {moaReview.comment && (
                            <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{moaReview.comment}</p>
                          )}
                        </div>
                      )}

                      {/* Action form — only for MOA without existing review */}
                      {!moaReview && canActMoa && (
                        <form
                          className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800"
                          action={async (fd) => {
                            "use server";
                            await moaFinalQuoteAction({
                              projectId, ftmId,
                              quoteSubmissionId: sub.id,
                              decision: fd.get("decision") as "ACCEPT" | "RESEND_CORRECTION" | "DECLINE",
                              comment: String(fd.get("comment") ?? ""),
                            });
                          }}
                        >
                          <textarea
                            name="comment" required placeholder="Bon pour accord ou observations..." rows={2}
                            className="w-full rounded-md border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="submit" name="decision" value="ACCEPT" className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">Valider</button>
                            <button type="submit" name="decision" value="RESEND_CORRECTION" className="rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Exiger correction</button>
                            <button type="submit" name="decision" value="DECLINE" className="rounded-md border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400">Refuser</button>
                          </div>
                        </form>
                      )}

                      {!moaReview && !canActMoa && (
                        <div className="mt-3 text-sm text-slate-400">En attente d'instruction MOA.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })(),
        }}
        historyDrawer={
          <FtmQuoteHistory quoteSubmissions={ftm.quoteSubmissions} pm={pm} />
        }
      />
    </div>
  );
}
