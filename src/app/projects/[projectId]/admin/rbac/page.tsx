import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { upsertCapabilityOverrideAction } from "@/server/rbac/admin-actions";

export default async function RbacAdminPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  const admin = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!admin) {
    return (
      <p className="text-sm text-red-600">
        Vous n’avez pas le droit d’administrer les permissions de ce projet.
      </p>
    );
  }

  const groups = await prisma.projectPermissionGroup.findMany({
    where: { projectId },
    include: { capabilities: true },
    orderBy: { name: "asc" },
  });

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: true,
      organization: true,
      permissionGroup: true,
      capabilityOverrides: true,
    },
    orderBy: { role: "asc" },
  });

  const caps = Object.values(Capability);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-600 underline">
          ← Projet
        </Link>
        <h1 className="mt-4 text-2xl font-semibold">Groupes & droits</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Groupes par défaut et contournements (deny gagne sur le groupe).
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Groupes de permissions</h2>
        <ul className="space-y-2">
          {groups.map((g) => (
            <li
              key={g.id}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="font-medium">{g.name}</div>
              <ul className="mt-2 list-inside list-disc text-slate-600 dark:text-slate-400">
                {g.capabilities.map((c) => (
                  <li key={c.id}>{c.capability}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Membres & overrides</h2>
        <div className="space-y-6">
          {members.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="text-sm font-medium">
                {m.user.name ?? m.user.email} — {m.role} ({m.organization.name})
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Groupe : {m.permissionGroup?.name ?? "—"}
              </div>
              {m.capabilityOverrides.length > 0 && (
                <ul className="mt-2 text-xs text-slate-600">
                  {m.capabilityOverrides.map((o) => (
                    <li key={o.id}>
                      {o.capability}: {o.allowed ? "allow" : "deny"}
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
                action={async (fd) => {
                  "use server";
                  await upsertCapabilityOverrideAction({
                    projectId,
                    targetProjectMemberId: String(fd.get("memberId")),
                    capability: fd.get("capability") as Capability,
                    allowed: fd.get("allowed") === "true",
                  });
                }}
              >
                <input type="hidden" name="memberId" value={m.id} />
                <select
                  name="capability"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  defaultValue={caps[0]}
                >
                  {caps.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  name="allowed"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                  defaultValue="false"
                >
                  <option value="true">allow</option>
                  <option value="false">deny</option>
                </select>
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Appliquer override
                </button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
