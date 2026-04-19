import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-sm space-y-6">
        {/* App identity */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-slate-700 dark:text-slate-300"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
              <path d="M7 8h2M7 12h10M13 8h4" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Gestion Financière FTM
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Pilotage financier de chantier
          </p>
        </div>

        {/* Form card */}
        <div className="rounded border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Connexion
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Accédez à vos projets et prévisionnels.
            </p>
          </div>
          <Suspense
            fallback={
              <p className="animate-pulse text-xs text-slate-400">Chargement…</p>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400 dark:text-slate-600">
          © {new Date().getFullYear()} Gestion Financière FTM
        </p>
      </div>
    </main>
  );
}
