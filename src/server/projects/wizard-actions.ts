"use server";

import * as React from "react";
import { revalidatePath } from "next/cache";
import { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";
import { DEFAULT_GROUP_NAMES, DEFAULT_ROLE_CAPABILITIES } from "@/lib/permissions/defaults";
import { createResetToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email";
import { MemberInviteEmail } from "@/emails/member-invite";

// Assumes role enum comes from prisma
type Role = "MOA" | "MOE" | "ENTREPRISE";

export async function createProjectExecutionAction(input: {
  name: string;
  code?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  startDate?: string;
  endDate?: string;
  lots: {
    label: string;
    description?: string;
    organizations: {
      organizationName: string;
      montantMarcheHtCents: string;
      address?: string;
      city?: string;
      postalCode?: string;
      siret?: string;
    }[];
  }[];
  users: {
    email: string;
    name?: string;
    role: Role;
    organizationName: string;
    permissionGroupId?: string;
  }[];
}) {
  const caller = await getAuthUser();
  if (!caller?.id) throw new Error("Non authentifié.");

  const dbUser = await prisma.user.findUnique({ where: { id: caller.id } });
  if (!dbUser?.isAdmin) throw new Error("Seuls les administrateurs peuvent créer un projet.");

  // Verify that the caller is in the users list so they don't get locked out
  if (caller.email && !input.users.some(u => u.email.toLowerCase() === caller.email?.toLowerCase())) {
    throw new Error(`Vous devez vous inclure dans l'équipe du projet avec votre adresse email (${caller.email}) pour y avoir accès ensuite.`);
  }

  // Calculate Base Contract amount logic
  let totalAmountCents = BigInt(0);
  for (const lot of input.lots) {
    for (const org of lot.organizations) {
      totalAmountCents += BigInt(org.montantMarcheHtCents);
    }
  }

  // Transaction creates the project, lots, organizations, and permissions
  const project = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: input.name,
        code: input.code || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
        baseContract: {
          create: {
            label: "Marché de Base Global",
            amountHtCents: totalAmountCents,
          },
        },
      },
    });

    // 1. Create default permission groups for each role
    const defaultGroupIds = new Map<ProjectRole, string>();
    for (const role of Object.values(ProjectRole)) {
      const group = await tx.projectPermissionGroup.create({
        data: {
          projectId: p.id,
          name: DEFAULT_GROUP_NAMES[role],
          capabilities: {
            create: DEFAULT_ROLE_CAPABILITIES[role].map((cap) => ({ capability: cap })),
          },
        },
      });
      defaultGroupIds.set(role, group.id);
    }

    // 2. Process Organizations to ensure they exist
    const orgNames = new Set<string>();
    input.lots.forEach(l => l.organizations.forEach(o => orgNames.add(o.organizationName)));
    input.users.forEach(u => orgNames.add(u.organizationName));

    const orgMap = new Map<string, string>(); // organizationName -> id
    // Build a lookup of org metadata from lot inputs
    const orgMetadata = new Map<string, { address?: string; city?: string; postalCode?: string; siret?: string }>();
    for (const lot of input.lots) {
      for (const o of lot.organizations) {
        if (!orgMetadata.has(o.organizationName)) {
          orgMetadata.set(o.organizationName, {
            address: o.address,
            city: o.city,
            postalCode: o.postalCode,
            siret: o.siret,
          });
        }
      }
    }

    for (const name of Array.from(orgNames)) {
      let org = await tx.organization.findFirst({ where: { name } });
      if (!org) {
        const meta = orgMetadata.get(name);
        org = await tx.organization.create({
          data: {
            name,
            address: meta?.address?.trim() || null,
            city: meta?.city?.trim() || null,
            postalCode: meta?.postalCode?.trim() || null,
            siret: meta?.siret?.trim() || null,
          },
        });
      } else {
        // Update existing org metadata if provided and currently empty
        const meta = orgMetadata.get(name);
        if (meta) {
          const updates: Record<string, string | null> = {};
          if (meta.address?.trim() && !org.address) updates.address = meta.address.trim();
          if (meta.city?.trim() && !org.city) updates.city = meta.city.trim();
          if (meta.postalCode?.trim() && !org.postalCode) updates.postalCode = meta.postalCode.trim();
          if (meta.siret?.trim() && !org.siret) updates.siret = meta.siret.trim();
          if (Object.keys(updates).length > 0) {
            await tx.organization.update({ where: { id: org.id }, data: updates });
          }
        }
      }
      orgMap.set(name, org.id);
    }

    // 3. Process Lots & Link to Organizations
    for (const lotInput of input.lots) {
      const lot = await tx.projectLot.create({
        data: {
          projectId: p.id,
          label: lotInput.label,
          description: lotInput.description || null,
        },
      });

      for (const orgInput of lotInput.organizations) {
        const orgId = orgMap.get(orgInput.organizationName);
        if (!orgId) continue;
        await tx.projectLotOrganization.create({
          data: {
            projectLotId: lot.id,
            organizationId: orgId,
            montantMarcheHtCents: BigInt(orgInput.montantMarcheHtCents),
          },
        });
      }
    }

    // 4. Process Users — track which were freshly created so we can email them
    // an activation link AFTER the transaction commits.
    const newlyCreated: { id: string; email: string; name: string | null }[] = [];

    for (const u of input.users) {
      const orgId = orgMap.get(u.organizationName);
      if (!orgId) continue;

      let dbUser = await tx.user.findUnique({ where: { email: u.email } });

      if (!dbUser) {
        dbUser = await tx.user.create({
          data: { email: u.email, name: u.name },
        });
        newlyCreated.push({ id: dbUser.id, email: dbUser.email, name: dbUser.name });
      }

      const groupId =
        u.permissionGroupId || defaultGroupIds.get(u.role as ProjectRole) || null;

      await tx.projectMember.create({
        data: {
          projectId: p.id,
          userId: dbUser.id,
          organizationId: orgId,
          role: u.role as ProjectRole,
          permissionGroupId: groupId,
        },
      });
    }

    return { p, newlyCreated };
  });

  // Send activation emails outside the transaction. A failure here must not
  // roll back project creation — log and continue.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  for (const u of project.newlyCreated) {
    try {
      const rawToken = await createResetToken(u.id, 60);
      const inviteLink = `${appUrl}/auth/set-password?token=${encodeURIComponent(rawToken)}&first=1`;
      await sendEmail({
        to: u.email,
        subject: `Invitation à rejoindre ${project.p.name} — Aurem Gestion Financière`,
        react: React.createElement(MemberInviteEmail, {
          inviteLink,
          projectName: project.p.name,
          recipientName: u.name ?? undefined,
        }),
      });
    } catch (err) {
      console.error(`[createProjectExecutionAction] invite email failed for ${u.email}:`, err);
    }
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.p.id}`);
}
