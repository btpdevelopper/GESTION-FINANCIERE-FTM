"use client";

import { useState, useTransition } from "react";
import { inviteEtudesParticipantAction } from "@/server/ftm/ftm-actions";

export function InviteEtudesForm({ projectId, ftmId }: { projectId: string; ftmId: string }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    setErr(null);
    setLink(null);
    start(async () => {
      try {
        const res = await inviteEtudesParticipantAction({ projectId, ftmId, email });
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        setLink(`${origin}/invite/${res.token}`);
      } catch (er) {
        setErr(er instanceof Error ? er.message : "Erreur");
      }
    });
  }

  return (
    <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
      <h3 className="text-sm font-medium">Inviter un participant (études)</h3>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
        <input
          name="email"
          type="email"
          required
          placeholder="email@exemple.fr"
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white dark:bg-slate-200 dark:text-slate-900"
        >
          {pending ? "…" : "Inviter"}
        </button>
      </form>
      {link && (
        <p className="mt-2 break-all text-xs text-emerald-700 dark:text-emerald-400">
          Lien invité (72h) : {link}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <p className="mt-1 text-xs text-slate-500">
        En production, envoyez ce lien par email (SMTP à brancher).
      </p>
    </div>
  );
}
