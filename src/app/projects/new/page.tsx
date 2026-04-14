import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { WizardForm } from "./wizard-form";
import { prisma } from "@/lib/prisma";

export default async function NewProjectPage() {
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.isAdmin) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Nouveau Projet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configurez les paramètres généraux, le découpage financier et l'équipe.
        </p>
      </div>

      <WizardForm />
    </div>
  );
}
