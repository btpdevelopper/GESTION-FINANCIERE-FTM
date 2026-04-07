import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound, redirect } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { createFtmAction } from "@/server/ftm/ftm-actions";

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

  async function create(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const modificationSource = String(formData.get("modificationSource") ?? "MOE") as
      | "MOA"
      | "MOE"
      | "ALEAS_EXECUTION";
    const description = String(formData.get("description") ?? "").trim();
    const selected = formData.getAll("orgId").map(String);
    if (!title || !description || selected.length === 0) {
      throw new Error("Champs requis manquants.");
    }
    const lots = selected.map((organizationId) => ({
      organizationId,
      descriptionTravaux: description,
      lotLabel: undefined as string | undefined,
    }));
    const ftm = await createFtmAction({
      projectId,
      title,
      modificationSource,
      concernedOrgIds: selected,
      lots,
    });
    redirect(`/projects/${projectId}/ftms/${ftm.id}`);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href={`/projects/${projectId}/ftms`} className="text-sm text-slate-600 underline">
        ← FTM
      </Link>
      <h1 className="text-2xl font-semibold">Nouveau FTM</h1>
      <form action={create} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Titre
          <input
            name="title"
            required
            className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Source de la modification
          <select
            name="modificationSource"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="MOA">MOA</option>
            <option value="MOE">MOE</option>
            <option value="ALEAS_EXECUTION">Aléas d&apos;exécution</option>
          </select>
        </label>
        <fieldset className="text-sm">
          <legend className="mb-2 font-medium">Entreprises concernées</legend>
          <div className="space-y-2">
            {orgs.map((o) => (
              <label key={o.id} className="flex items-center gap-2">
                <input type="checkbox" name="orgId" value={o.id} />
                {o.name}
              </label>
            ))}
            {orgs.length === 0 && (
              <p className="text-slate-500">Aucune entreprise sur ce projet.</p>
            )}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          Description des travaux complémentaires (par lot)
          <textarea
            name="description"
            required
            rows={5}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Créer
        </button>
      </form>
    </div>
  );
}
