"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function AppHeader({ email }: { email?: string | null }) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-4">
        <Link href="/projects" className="font-medium text-slate-900 dark:text-slate-100">
          Gestion FTM
        </Link>
        {email && (
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
        )}
      </div>
      <button
        type="button"
        className="text-sm text-slate-600 underline dark:text-slate-400"
        onClick={() => signOut()}
      >
        Déconnexion
      </button>
    </header>
  );
}
