import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound, redirect } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { NewFtmForm } from "./new-ftm-form";

export default async function NewFtmPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  const canCreate = await can(pm.id, Capability.CREATE_FTM);
  if (!canCreate) {
    return (
      <p className="text-sm text-red-600">
        Vous n’avez pas le droit de créer un FTM sur ce projet.
      </p>
    );
  }

  const orgs = await prisma.organization.findMany({
    where: {
      projectMembers: {
        some: { projectId, role: "ENTREPRISE" },
      },
    },
    orderBy: { name: "asc" },
  });



  const agg = await prisma.ftmRecord.aggregate({
    where: { projectId },
    _max: { number: true },
  });
  const nextNumber = (agg._max.number || 0) + 1;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href={`/projects/${projectId}/ftms`} className="text-sm text-slate-600 underline hover:text-slate-900 transition-colors">
        ← Tableau des FTM
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Nouveau FTM
        </h1>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          FTM N°{nextNumber}
        </span>
      </div>
      <NewFtmForm
        projectId={projectId}
        role={pm.role}
        userOrgId={pm.organizationId}
        orgs={orgs}
      />
    </div>
  );
}
