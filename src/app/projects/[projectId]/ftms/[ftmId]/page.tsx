import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import {
  ProjectRole,
  FtmPhase,
  MoaEtudesDecision,
  CreationMoeDecision,
  Capability,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { getFtmDetail, phaseLabel } from "@/server/ftm/queries";
import { resolveCapabilities } from "@/lib/permissions/resolve";
import {
  moeDecideCreationAction,
  saveEtudesAction,
  moaDecideEtudesAction,
  setDeadlinesAndOpenQuotingAction,
  postFtmChatAction,
  submitQuoteAction,
  moeAnalyzeQuoteAction,
  moaFinalQuoteAction,
  setDesignatedMoaValidatorAction,
} from "@/server/ftm/ftm-actions";
import { InviteEtudesForm } from "./invite-etudes-form";
import { FtmActionButton } from "./ftm-action-buttons";

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

  const latestSubmission = ftm.quoteSubmissions[0];
  const myLot = ftm.lots.find((l) => l.organizationId === pm.organizationId);

  return (
    <div className="space-y-10">
      <div>
        <Link href={`/projects/${projectId}/ftms`} className="text-sm text-slate-600 underline">
          ← FTM
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{ftm.title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {phaseLabel(ftm.phase)} · Source : {ftm.modificationSource}
        </p>
      </div>

      {ftm.phase === FtmPhase.CANCELLED && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
          Ce FTM est <strong>annulé</strong>.
        </div>
      )}
      {ftm.phase === FtmPhase.ACCEPTED && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
          Ce FTM est <strong>accepté</strong> (validation MOA finale).
        </div>
      )}

      {caps[Capability.ADMIN_PROJECT_PERMISSIONS] && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <h2 className="font-medium">Validateur MOA désigné (FTM)</h2>
          <form
            className="mt-2 flex flex-wrap items-end gap-2"
            action={async (fd) => {
              "use server";
              const v = fd.get("designatedMoaValidatorId");
              await setDesignatedMoaValidatorAction({
                projectId,
                ftmId,
                designatedMoaValidatorId: v ? String(v) : null,
              });
            }}
          >
            <select
              name="designatedMoaValidatorId"
              defaultValue={ftm.designatedMoaValidatorId ?? ""}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">—</option>
              {moaMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.name ?? m.user.email} ({m.organization.name})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
            >
              Enregistrer
            </button>
          </form>
        </section>
      )}

      {ftm.phase === FtmPhase.CREATION && ftm.creationMoeDecision === CreationMoeDecision.PENDING && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-medium">Création — validation MOE</h2>
          <p className="text-sm text-slate-600">
            Une entreprise a demandé la création de ce FTM. Le MOE doit valider ou refuser.
          </p>
          {pm.role === ProjectRole.MOE && caps[Capability.APPROVE_FTM_CREATION_MOE] && (
            <div className="flex gap-2">
              <FtmActionButton
                label="Valider"
                action={() => moeDecideCreationAction({ projectId, ftmId, decision: "APPROVED" })}
              />
              <FtmActionButton
                label="Refuser"
                variant="danger"
                action={() => moeDecideCreationAction({ projectId, ftmId, decision: "DECLINED" })}
              />
            </div>
          )}
        </section>
      )}

      {ftm.phase === FtmPhase.ETUDES && (
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="font-medium">Études</h2>
            {(pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
              caps[Capability.EDIT_ETUDES] && (
                <form
                  action={async (fd) => {
                    "use server";
                    await saveEtudesAction({
                      projectId,
                      ftmId,
                      etudesDescription: String(fd.get("etudes") ?? ""),
                    });
                  }}
                  className="flex flex-col gap-2"
                >
                  <textarea
                    name="etudes"
                    defaultValue={ftm.etudesDescription ?? ""}
                    rows={6}
                    className="rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                  <button
                    type="submit"
                    className="w-fit rounded bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
                  >
                    Enregistrer les études
                  </button>
                </form>
              )}

            {(pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
              caps[Capability.INVITE_ETUDES_PARTICIPANT] && (
                <InviteEtudesForm projectId={projectId} ftmId={ftmId} />
              )}

            {pm.role === ProjectRole.MOA && caps[Capability.VALIDATE_ETUDES_MOA] && (
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h3 className="text-sm font-medium">Validation MOA des études</h3>
                <form
                  action={async (fd) => {
                    "use server";
                    await moaDecideEtudesAction({
                      projectId,
                      ftmId,
                      decision: fd.get("decision") === "APPROVED" ? "APPROVED" : "DECLINED",
                      comment: String(fd.get("comment") ?? ""),
                    });
                  }}
                  className="mt-2 flex flex-col gap-2"
                >
                  <textarea
                    name="comment"
                    placeholder="Commentaire (recommandé)"
                    rows={2}
                    className="rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      name="decision"
                      value="APPROVED"
                      className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
                    >
                      Approuver les études
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="DECLINED"
                      className="rounded bg-red-700 px-3 py-1.5 text-xs text-white"
                    >
                      Refuser (annule le FTM)
                    </button>
                  </div>
                </form>
              </div>
            )}

            {ftm.moaEtudesDecision === MoaEtudesDecision.APPROVED &&
              ftm.phase === FtmPhase.ETUDES &&
              (pm.role === ProjectRole.MOE || pm.role === ProjectRole.MOA) &&
              (caps[Capability.SET_DEADLINES_AFTER_ETUDES] ||
                caps[Capability.VALIDATE_ETUDES_MOA]) && (
                <form
                  action={async (fd) => {
                    "use server";
                    const entries = Array.from(fd.entries()).filter(([k]) => k.startsWith("deadline-"));
                    const deadlines = entries.map(([k, v]) => ({
                      organizationId: k.replace("deadline-", ""),
                      dateLimiteDevis: String(v),
                    }));
                    await setDeadlinesAndOpenQuotingAction({ projectId, ftmId, deadlines });
                  }}
                  className="border-t border-slate-100 pt-4 dark:border-slate-800"
                >
                  <h3 className="text-sm font-medium">Délais de devis par entreprise</h3>
                  <div className="mt-2 space-y-2">
                    {ftm.concernedOrgs.map((c) => (
                      <label key={c.id} className="flex flex-col text-xs">
                        {c.organization.name}
                        <input
                          type="datetime-local"
                          name={`deadline-${c.organizationId}`}
                          required
                          defaultValue={
                            c.dateLimiteDevis
                              ? new Date(c.dateLimiteDevis).toISOString().slice(0, 16)
                              : undefined
                          }
                          className="mt-1 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="submit"
                    className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
                  >
                    Enregistrer et ouvrir la phase devis
                  </button>
                </form>
              )}
          </section>
        )}

      {(ftm.phase === FtmPhase.QUOTING ||
        ftm.phase === FtmPhase.ANALYSIS ||
        ftm.phase === FtmPhase.MOA_FINAL) && (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-medium">Messagerie FTM</h2>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {ftm.chatMessages.map((m) => (
              <li key={m.id} className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                <span className="text-xs text-slate-500">
                  {m.author
                    ? `${m.author.user.name ?? m.author.user.email} (${m.author.organization.name})`
                    : "Invité"}
                  {" · "}
                  {new Date(m.createdAt).toLocaleString("fr-FR")}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
            {ftm.chatMessages.length === 0 && (
              <li className="text-sm text-slate-500">Aucun message.</li>
            )}
          </ul>
          {caps[Capability.POST_FTM_CHAT] && (
            <form
              action={async (fd) => {
                "use server";
                await postFtmChatAction({
                  projectId,
                  ftmId,
                  body: String(fd.get("body") ?? ""),
                });
              }}
              className="flex flex-col gap-2"
            >
              <textarea
                name="body"
                rows={2}
                placeholder="Question ou précision…"
                className="rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="w-fit rounded bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Envoyer
              </button>
            </form>
          )}
        </section>
      )}

      {(ftm.phase === FtmPhase.QUOTING || ftm.phase === FtmPhase.ANALYSIS) &&
        pm.role === ProjectRole.ENTREPRISE &&
        myLot &&
        caps[Capability.SUBMIT_QUOTE] && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="font-medium">Soumettre un devis (HT)</h2>
            <p className="mt-1 text-xs text-slate-500">{myLot.descriptionTravaux}</p>
            <form
              action={async (fd) => {
                "use server";
                await submitQuoteAction({
                  projectId,
                  ftmId,
                  ftmLotId: myLot.id,
                  organizationId: pm.organizationId,
                  amountHt: String(fd.get("amountHt") ?? ""),
                });
              }}
              className="mt-3 flex flex-col gap-2"
            >
              <input
                name="amountHt"
                type="text"
                required
                placeholder="ex. 12500.50"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <button
                type="submit"
                className="w-fit rounded bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
              >
                Soumettre le devis
              </button>
            </form>
          </section>
        )}

      {ftm.phase === FtmPhase.ANALYSIS && latestSubmission && pm.role === ProjectRole.MOE && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-medium">Analyse MOE — dernier devis</h2>
          <p className="text-sm">
            Indice {latestSubmission.indice} —{" "}
            {Number(latestSubmission.amountHt).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            HT ({latestSubmission.organization.name})
          </p>
          {caps[Capability.ANALYZE_QUOTE_MOE] && (
            <form
              className="flex flex-col gap-2"
              action={async (fd) => {
                "use server";
                const decision = fd.get("decision") as "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
                const scope = fd.get("declineScope") as "WHOLE_FTM" | "THIS_COMPANY_ONLY" | null;
                await moeAnalyzeQuoteAction({
                  projectId,
                  ftmId,
                  quoteSubmissionId: latestSubmission.id,
                  decision,
                  comment: String(fd.get("comment") ?? ""),
                  declineScope: decision === "DECLINE" ? scope ?? undefined : undefined,
                });
              }}
            >
              <textarea
                name="comment"
                required
                placeholder="Commentaire MOE"
                rows={3}
                className="rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <label className="text-xs">
                Si refus : périmètre
                <select
                  name="declineScope"
                  className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                >
                  <option value="WHOLE_FTM">Tout le FTM</option>
                  <option value="THIS_COMPANY_ONLY">Cette entreprise seulement</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="ACCEPT"
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
                >
                  Valider
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="RESEND_CORRECTION"
                  className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white"
                >
                  Renvoyer pour correction
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="DECLINE"
                  className="rounded bg-red-700 px-3 py-1.5 text-xs text-white"
                >
                  Refuser
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {ftm.phase === FtmPhase.MOA_FINAL && latestSubmission && pm.role === ProjectRole.MOA && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="font-medium">Validation MOA finale</h2>
          <p className="text-sm">
            Devis indice {latestSubmission.indice} —{" "}
            {Number(latestSubmission.amountHt).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            HT
          </p>
          {caps[Capability.FINAL_VALIDATE_QUOTE_MOA] && (
            <form
              className="flex flex-col gap-2"
              action={async (fd) => {
                "use server";
                await moaFinalQuoteAction({
                  projectId,
                  ftmId,
                  quoteSubmissionId: latestSubmission.id,
                  decision: fd.get("decision") as "ACCEPT" | "RESEND_CORRECTION" | "DECLINE",
                  comment: String(fd.get("comment") ?? ""),
                });
              }}
            >
              <textarea
                name="comment"
                required
                placeholder="Commentaire MOA"
                rows={3}
                className="rounded border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-900"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  name="decision"
                  value="ACCEPT"
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white"
                >
                  Accepter
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="RESEND_CORRECTION"
                  className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white"
                >
                  Renvoyer pour correction
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="DECLINE"
                  className="rounded bg-red-700 px-3 py-1.5 text-xs text-white"
                >
                  Refuser
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="font-medium">Historique des devis & avis</h2>
        <ul className="mt-2 space-y-3">
          {ftm.quoteSubmissions.map((q) => (
            <li key={q.id} className="border-l-2 border-slate-300 pl-3 dark:border-slate-600">
              <div>
                Indice {q.indice} —{" "}
                {Number(q.amountHt).toLocaleString("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                })}{" "}
                HT — {q.organization.name}
              </div>
              {q.reviews.map((r) => (
                <div key={r.id} className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  <strong>{r.context}</strong> · {r.decision} —{" "}
                  {r.reviewer.user.name ?? r.reviewer.user.email}: {r.comment}
                </div>
              ))}
            </li>
          ))}
          {ftm.quoteSubmissions.length === 0 && <li className="text-slate-500">Aucun devis.</li>}
        </ul>
      </section>
    </div>
  );
}
