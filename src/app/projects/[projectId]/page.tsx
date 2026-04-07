import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  await requireProjectMember(user.id, projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { baseContract: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        {project.baseContract && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Marché de base : <strong>{project.baseContract.label}</strong> —{" "}
            {Number(project.baseContract.amountHt).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            HT
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
          href={`/projects/${projectId}/ftms`}
        >
          FTM
        </Link>
        <Link
          className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-600"
          href={`/projects/${projectId}/admin/rbac`}
        >
          Droits & groupes
        </Link>
      </div>
    </div>
  );
}
