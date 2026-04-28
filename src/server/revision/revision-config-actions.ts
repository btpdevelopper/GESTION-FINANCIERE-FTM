"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { fetchInseeIndex } from "@/lib/revision/insee-fetcher";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ComponentSchema = z.object({
  id: z.string().uuid().optional(), // omit for new components
  idbank: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  weight: z.number().positive(),
  baseValue: z.number().positive().nullable(), // null = attempt auto-fetch
});

const UpsertRevisionConfigSchema = z.object({
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  moisZero: z.string().regex(/^\d{4}-\d{2}$/, "Format attendu : YYYY-MM"),
  fixedPart: z.number().min(0).max(1),
  variablePart: z.number().min(0).max(1),
  components: z
    .array(ComponentSchema)
    .min(1, "Au moins un indice requis.")
    .refine(
      (comps) => {
        const total = comps.reduce((s, c) => s + c.weight, 0);
        return Math.abs(total - 1) < 0.001;
      },
      { message: "La somme des pondérations doit être égale à 1." }
    ),
}).refine(
  (d) => Math.abs(d.fixedPart + d.variablePart - 1) < 0.001,
  { message: "La partie fixe (a) et la partie variable (b) doivent sommer à 1." }
);

// ─── Fetch Index_0 for a given idbank + moisZero ─────────────────────────────

export async function fetchBaseIndexAction(raw: unknown) {
  const parsed = z
    .object({ idbank: z.string().min(1), moisZero: z.string().regex(/^\d{4}-\d{2}$/) })
    .safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides.");

  const { idbank, moisZero } = parsed.data;
  const result = await fetchInseeIndex(idbank, moisZero);
  return result; // null = not found, caller shows manual input
}

// ─── Upsert the full config + components ─────────────────────────────────────

export async function upsertRevisionIndexConfigAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = UpsertRevisionConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CONFIGURE_CONTRACT_SETTINGS);
  if (!allowed) throw new Error("Permission refusée.");

  // Verify the contract settings exist for this org
  const settings = await prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: data.organizationId } },
  });
  if (!settings) throw new Error("Paramètres de contrat introuvables pour cette entreprise.");
  if (!settings.revisionPrixActive) throw new Error("La révision de prix n'est pas activée pour cette entreprise.");

  // Auto-fetch any baseValues that are null
  const resolvedComponents = await Promise.all(
    data.components.map(async (c) => {
      if (c.baseValue !== null) return { ...c, baseValue: c.baseValue };
      const fetched = await fetchInseeIndex(c.idbank, data.moisZero);
      return { ...c, baseValue: fetched?.value ?? null };
    })
  );

  // Reject if any component still has no baseValue
  const missing = resolvedComponents.filter((c) => c.baseValue === null).map((c) => c.label);
  if (missing.length > 0) {
    throw new Error(
      `Valeur de base (Index_0) introuvable pour : ${missing.join(", ")}. Veuillez la saisir manuellement.`
    );
  }

  await prisma.$transaction(async (tx) => {
    // Upsert the config header
    const config = await tx.revisionIndexConfig.upsert({
      where: { projectId_organizationId: { projectId: data.projectId, organizationId: data.organizationId } },
      create: {
        projectId: data.projectId,
        organizationId: data.organizationId,
        moisZero: data.moisZero,
        fixedPart: data.fixedPart,
        variablePart: data.variablePart,
      },
      update: {
        moisZero: data.moisZero,
        fixedPart: data.fixedPart,
        variablePart: data.variablePart,
      },
    });

    // Delete removed components
    const incomingIds = resolvedComponents.filter((c) => c.id).map((c) => c.id!);
    await tx.revisionIndexComponent.deleteMany({
      where: { configId: config.id, id: { notIn: incomingIds } },
    });

    // Upsert each component
    for (const comp of resolvedComponents) {
      if (comp.id) {
        await tx.revisionIndexComponent.update({
          where: { id: comp.id },
          data: {
            idbank: comp.idbank,
            label: comp.label,
            weight: comp.weight,
            baseValue: comp.baseValue!,
          },
        });
      } else {
        await tx.revisionIndexComponent.create({
          data: {
            configId: config.id,
            idbank: comp.idbank,
            label: comp.label,
            weight: comp.weight,
            baseValue: comp.baseValue!,
          },
        });
      }
    }
  });

  revalidatePath(`/projects/${data.projectId}/admin`);
}

// ─── Delete the config (and all components, cascade) ─────────────────────────

export async function deleteRevisionIndexConfigAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = z
    .object({ projectId: z.string().uuid(), organizationId: z.string().uuid() })
    .safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides.");
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CONFIGURE_CONTRACT_SETTINGS);
  if (!allowed) throw new Error("Permission refusée.");

  await prisma.revisionIndexConfig.deleteMany({
    where: { projectId: data.projectId, organizationId: data.organizationId },
  });

  revalidatePath(`/projects/${data.projectId}/admin`);
}
