import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4">
      <div>
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Accès aux projets et FTM.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Chargement…</p>}>
        <LoginForm />
      </Suspense>
      <Link className="text-sm text-slate-600 underline dark:text-slate-400" href="/">
        Retour
      </Link>
    </main>
  );
}
