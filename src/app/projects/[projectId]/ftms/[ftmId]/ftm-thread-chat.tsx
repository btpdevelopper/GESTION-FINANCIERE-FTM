"use client";

import { useState, useRef } from "react";
import { ProjectRole, Capability } from "@prisma/client";
import { postFtmChatAction } from "@/server/ftm/ftm-actions";
import { useFormStatus } from "react-dom";

export function FtmThreadChat({
  projectId,
  ftmId,
  messages,
  concernedOrgs,
  pmRole,
  pmId,
  capabilities,
  isQuotingOpen,
}: {
  projectId: string;
  ftmId: string;
  messages: any[];
  concernedOrgs: any[];
  pmRole: ProjectRole;
  pmId: string;
  capabilities: { [key in Capability]?: boolean };
  isQuotingOpen: boolean;
}) {
  const [activeTabId, setActiveTabId] = useState<string | "internal">(
    pmRole === ProjectRole.ENTREPRISE ? "enterprise" : "internal"
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Group messages
  const internalMessages = messages.filter((m) => m.targetOrganizationId === null);
  const getThreadMessages = (orgId: string) => messages.filter((m) => m.targetOrganizationId === orgId);

  const activeMessages =
    activeTabId === "internal"
      ? internalMessages
      : activeTabId === "enterprise"
      ? messages // the server already filtered these to just their own
      : getThreadMessages(activeTabId);

  const canPost = capabilities[Capability.POST_FTM_CHAT];

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Messagerie
        </h4>
      </div>

      {/* ── Locked state: quoting not yet open ── */}
      {!isQuotingOpen ? (
        <div className="px-5 py-8 flex flex-col items-center justify-center gap-2 text-center">
          <span className="text-2xl select-none">🔒</span>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Messagerie non disponible
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            La messagerie s&apos;ouvre avec la phase Devis.
          </p>
        </div>
      ) : (
        <>
          {pmRole !== ProjectRole.ENTREPRISE && (
            <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setActiveTabId("internal")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTabId === "internal"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                Notes internes (MOE/MOA)
              </button>
              {concernedOrgs.map((org) => (
                <button
                  key={org.organizationId}
                  onClick={() => setActiveTabId(org.organizationId)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeTabId === org.organizationId
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                  }`}
                >
                  🏢 {org.organization.name}
                </button>
              ))}
            </div>
          )}

          {pmRole === ProjectRole.ENTREPRISE && (
            <div className="px-5 pt-3">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                🔒 Fil de discussion sécurisé avec le MOE
              </p>
            </div>
          )}

          <div className="p-5 flex flex-col gap-2">
            <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-2">
              {(() => {
                const sorted = [...activeMessages].sort(
                  (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );

                if (sorted.length === 0) {
                  return (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Aucun message.
                    </p>
                  );
                }

                const groups: { authorId: string; authorString: string; messages: any[] }[] = [];
                for (const msg of sorted) {
                  const authorId = msg.author?.id ?? "guest";
                  const authorString = msg.author
                    ? `${msg.author.user?.name ?? msg.author.user?.email} (${msg.author.organization?.name})`
                    : "Invité";

                  if (groups.length > 0 && groups[groups.length - 1].authorId === authorId) {
                    groups[groups.length - 1].messages.push(msg);
                  } else {
                    groups.push({ authorId, authorString, messages: [msg] });
                  }
                }

                return groups.map((g, idx) => {
                  const isMe = pmId === g.authorId;
                  return (
                    <li key={idx} className={`mb-3 flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                      <span className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                        {g.authorString}
                      </span>
                      <div className={`flex flex-col gap-1.5 w-full max-w-[85%] ${isMe ? "items-end" : "items-start"}`}>
                        {g.messages.map((m) => (
                          <div
                            key={m.id}
                            className={`rounded-xl px-4 py-2.5 text-sm shadow-sm ${
                              isMe
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-tr-sm"
                                : "bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-800/80 dark:border-slate-700/50 dark:text-slate-200 rounded-tl-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{m.body}</p>
                            <span className={`block mt-1 text-[9px] font-medium ${isMe ? "text-slate-400 dark:text-slate-500 text-right" : "text-slate-400"}`}>
                              {new Date(m.createdAt).toLocaleString("fr-FR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                });
              })()}
            </ul>
            {canPost && (
              <form
                ref={formRef}
                action={async (fd) => {
                  await postFtmChatAction({
                    projectId,
                    ftmId,
                    body: String(fd.get("body") ?? ""),
                    targetOrganizationId: activeTabId === "internal" || activeTabId === "enterprise" ? null : activeTabId,
                  });
                  formRef.current?.reset();
                }}
                className="mt-1 flex gap-2"
              >
                <input
                  name="body"
                  placeholder="Écrire un message..."
                  className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  required
                />
                <SubmitButton />
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-50"
    >
      {pending ? "Envoi..." : "Envoyer"}
    </button>
  );
}
