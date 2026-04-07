import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getAuthUser();
  if (user) {
    redirect("/projects");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Gestion financière FTM</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Application de suivi des marchés et FTM pour la construction (France).
      </p>
      <Link
        className="inline-flex w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        href="/login"
      >
        Connexion
      </Link>
    </main>
  );
}
