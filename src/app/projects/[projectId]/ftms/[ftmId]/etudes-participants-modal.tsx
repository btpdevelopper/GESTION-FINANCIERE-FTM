"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { UserPlus, X, ExternalLink, Users } from "lucide-react";
import {
  inviteEtudesParticipantAction,
  assignProjectMemberToEtudesAction,
} from "@/server/ftm/ftm-actions";

type Invitation = {
  id: string;
  email: string;
  userId: string | null;
  contribution: string | null;
  consumedAt: string | Date | null;
  expiresAt: string | Date;
  role: string;
  createdAt: string | Date;
};

type ProjectMemberOption = {
  id: string;
  userId: string;
  role: string;
  user: { name: string | null; email: string };
  organization: { name: string };
};

function invitationStatus(inv: Invitation): {
  label: string;
  cls: string;
} {
  if (inv.contribution) {
    return {
      label: "Contribution reçue",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    };
  }
  if (inv.consumedAt) {
    return {
      label: "Consulté",
      cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  if (new Date(inv.expiresAt) < new Date()) {
    return {
      label: "Expiré",
      cls: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
    };
  }
  return {
    label: "En attente",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  };
}

export function EtudesParticipantsModal({
  projectId,
  ftmId,
  invitations,
  projectMembers,
}: {
  projectId: string;
  ftmId: string;
  invitations: Invitation[];
  projectMembers: ProjectMemberOption[];
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"external" | "member">("external");
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  // Filter out members already invited
  const invitedEmails = new Set(invitations.map((i) => i.email.toLowerCase()));
  const availableMembers = projectMembers.filter(
    (m) => !invitedEmails.has(m.user.email.toLowerCase())
  );

  function handleExternalInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    setError(null);
    setLink(null);
    setSuccess(null);
    start(async () => {
      try {
        const res = await inviteEtudesParticipantAction({
          projectId,
          ftmId,
          email,
        });
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        setLink(`${origin}/invite/${res.token}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  function handleMemberAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const memberId = String(fd.get("memberId") ?? "");
    if (!memberId) return;
    setError(null);
    setLink(null);
    setSuccess(null);
    start(async () => {
      try {
        await assignProjectMemberToEtudesAction({
          projectId,
          ftmId,
          projectMemberId: memberId,
        });
        setSuccess("Membre ajouté.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setLink(null);
          setSuccess(null);
        }}
        title="Gérer les participants"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Participants aux études
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* Invite tabs */}
          <div className="flex gap-1 rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab("external")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "external"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
              }`}
            >
              <ExternalLink className="h-3 w-3" />
              Externe
            </button>
            <button
              type="button"
              onClick={() => setTab("member")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "member"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
              }`}
            >
              <Users className="h-3 w-3" />
              Membre du projet
            </button>
          </div>

          {/* External invite form */}
          {tab === "external" && (
            <form
              onSubmit={handleExternalInvite}
              className="mt-3 flex items-end gap-2"
            >
              <div className="flex flex-1 flex-col">
                <label className="mb-1 text-xs font-medium text-slate-500">
                  Email du contributeur externe
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="email@exemple.fr"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {pending ? "..." : "Inviter"}
              </button>
            </form>
          )}

          {/* Member assignment form */}
          {tab === "member" && (
            <form
              onSubmit={handleMemberAssign}
              className="mt-3 flex items-end gap-2"
            >
              <div className="flex flex-1 flex-col">
                <label className="mb-1 text-xs font-medium text-slate-500">
                  Membre MOE/MOA
                </label>
                <select
                  name="memberId"
                  required
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                >
                  <option value="">Sélectionner...</option>
                  {availableMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.user.name ?? m.user.email} — {m.organization.name} (
                      {m.role})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {pending ? "..." : "Ajouter"}
              </button>
            </form>
          )}

          {/* Feedback messages */}
          {link && (
            <p className="mt-2 break-all rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Lien d&#39;invitation (72h) :{" "}
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-slate-900 underline dark:text-slate-200"
              >
                {link}
              </a>
            </p>
          )}
          {success && (
            <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {success}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Participant list */}
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Participants ({invitations.length})
            </h3>
            {invitations.length === 0 ? (
              <p className="text-sm text-slate-400">
                Aucun participant invité.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {invitations.map((inv) => {
                  const { label, cls } = invitationStatus(inv);
                  return (
                    <div
                      key={inv.id}
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {inv.email}
                          </span>
                          <span className="ml-1.5 text-xs text-slate-400">
                            {inv.role === "BUREAU_ETUDES" ? "Bureau d'études" : "Autre"}
                          </span>
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${cls}`}
                        >
                          {label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        Invité le{" "}
                        {new Date(inv.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                        {inv.userId && " (membre du projet)"}
                      </div>
                      {inv.contribution && (
                        <div className="mt-2 rounded-md bg-slate-50 p-2.5 text-sm text-slate-700 whitespace-pre-wrap dark:bg-slate-800/60 dark:text-slate-300">
                          {inv.contribution}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
