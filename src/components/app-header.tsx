"use client";

import Link from "next/link";
import { signOutAction } from "@/server/auth/sign-out-action";

export function AppHeader({ email }: { email?: string | null }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
        >
          Gestion FTM
        </Link>
        {email && (
          <span className="hidden text-xs text-slate-400 sm:inline">{email}</span>
        )}
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          className="text-xs text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Déconnexion
        </button>
      </form>
    </header>
  );
}
