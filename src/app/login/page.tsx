import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen">
      {/* Visual left panel */}
      <div className="hidden relative overflow-hidden bg-slate-900 lg:flex lg:w-1/2">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-700 to-slate-900 opacity-90" />
        <div className="absolute -left-1/4 top-0 h-full w-full -rotate-12 transform bg-gradient-to-r from-transparent via-white/10 to-transparent blur-3xl mix-blend-overlay" />
        <div className="relative z-10 flex flex-col justify-center p-16 text-white">
          <h1 className="mb-6 mt-auto text-5xl font-bold tracking-tight">
            Gestion Financière <br /> FTM
          </h1>
          <p className="max-w-md text-lg text-indigo-100/80">
            Une plateforme moderne et dynamique pour piloter les modifications de vos chantiers, collaborer avec vos partenaires et sécuriser vos budgets.
          </p>
        </div>
      </div>

      {/* Login form right panel */}
      <div className="flex w-full items-center justify-center bg-slate-50 p-8 dark:bg-slate-950 sm:p-12 lg:w-1/2">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-slate-100 bg-white/70 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-slate-900/50">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Bon retour
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Connectez-vous pour accéder à vos projets et FTM.
            </p>
          </div>
          <Suspense fallback={<p className="animate-pulse text-sm text-slate-500">Chargement…</p>}>
            <LoginForm />
          </Suspense>
          <div className="flex items-center justify-center pt-4">
            <Link
              className="font-medium text-indigo-600 transition-colors hover:text-indigo-500 dark:text-indigo-400"
              href="/"
            >
              ← Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
