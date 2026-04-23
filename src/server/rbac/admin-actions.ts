"use server";

import * as React from "react";
import { revalidatePath } from "next/cache";
import { Capability, ProjectRole } from "@prisma/client";
import { getAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can, mergeCapabilities } from "@/lib/permissions/resolve";
import { DEFAULT_GROUP_NAMES } from "@/lib/permissions/defaults";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { MemberInviteEmail } from "@/emails/member-invite";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function requireAdmin(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, projectId);
  const ok = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!ok) throw new Error("Accès administration refusé.");
  return { user, pm };
}

/**
 * Load all members of a project with enough data to compute whether they
 * currently have ADMIN_PROJECT_PERMISSIONS. Used for last-admin safety checks.
 */
async function loadMembersForAdminCheck(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId },
    include: {
      permissionGroup: { include: { capabilities: true } },
      capabilityOverrides: true,
    },
  });
}

type MemberForAdminCheck = Awaited<ReturnType<typeof loadMembersForAdminCheck>>[number];

function memberIsAdmin(
  member: MemberForAdminCheck,
  overrides?: {
    permissionGroupCapabilities?: Capability[];
  },
): boolean {
  const groupCaps =
    overrides?.permissionGroupCapabilities ??
    member.permissionGroup?.capabilities.map((c) => c.capability) ??
    [];
  const merged = mergeCapabilities(
    groupCaps,
    member.capabilityOverrides.map((o) => ({ capability: o.capability, allowed: o.allowed })),
  );
  return merged[Capability.ADMIN_PROJECT_PERMISSIONS] === true;
}

async function groupCapabilities(groupId: string | null): Promise<Capability[]> {
  if (!groupId) return [];
  const g = await prisma.projectPermissionGroup.findUnique({
    where: { id: groupId },
    include: { capabilities: true },
  });
  return g?.capabilities.map((c) => c.capability) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability override CRUD (existing)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertCapabilityOverrideAction(input: {
  projectId: string;
  targetProjectMemberId: string;
  capability: Capability;
  allowed: boolean;
}) {
  const { pm: callerPm } = await requireAdmin(input.projectId);

  // Safety: if the override would remove ADMIN_PROJECT_PERMISSIONS from the last
  // admin of the project, reject. Same for modifying own override to lock self out.
  if (input.capability === Capability.ADMIN_PROJECT_PERMISSIONS && input.allowed === false) {
    const members = await loadMembersForAdminCheck(input.projectId);
    let remainingAdmins = 0;
    for (const m of members) {
      if (m.id === input.targetProjectMemberId) {
        // Simulate deny override on admin capability
        const groupCaps =
          m.permissionGroup?.capabilities.map((c) => c.capability) ?? [];
        const simulatedOverrides = [
          ...m.capabilityOverrides.filter(
            (o) => o.capability !== Capability.ADMIN_PROJECT_PERMISSIONS,
          ),
          { capability: Capability.ADMIN_PROJECT_PERMISSIONS, allowed: false },
        ];
        const merged = mergeCapabilities(groupCaps, simulatedOverrides);
        if (merged[Capability.ADMIN_PROJECT_PERMISSIONS]) remainingAdmins++;
      } else if (memberIsAdmin(m)) {
        remainingAdmins++;
      }
    }
    if (remainingAdmins === 0) {
      throw new Error(
        "Action bloquée : un projet doit toujours conserver au moins un administrateur.",
      );
    }
  }

  await prisma.projectMemberCapabilityOverride.upsert({
    where: {
      projectMemberId_capability: {
        projectMemberId: input.targetProjectMemberId,
        capability: input.capability,
      },
    },
    update: { allowed: input.allowed },
    create: {
      projectMemberId: input.targetProjectMemberId,
      capability: input.capability,
      allowed: input.allowed,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function deleteCapabilityOverrideAction(input: {
  projectId: string;
  overrideId: string;
}) {
  await requireAdmin(input.projectId);

  await prisma.projectMemberCapabilityOverride.delete({
    where: { id: input.overrideId },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project member CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function inviteProjectMemberAction(input: {
  projectId: string;
  email: string;
  name: string;
  organizationName: string;
  role: ProjectRole;
  permissionGroupId: string | null;
}) {
  await requireAdmin(input.projectId);

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const orgName = input.organizationName.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Adresse email invalide.");
  }
  if (!orgName) throw new Error("Raison sociale de l'organisation requise.");

  // Resolve the permission group: explicit > default for role > none
  let resolvedGroupId = input.permissionGroupId || null;

  if (input.permissionGroupId) {
    const g = await prisma.projectPermissionGroup.findFirst({
      where: { id: input.permissionGroupId, projectId: input.projectId },
    });
    if (!g) throw new Error("Groupe de permissions invalide.");
  } else {
    const defaultName = DEFAULT_GROUP_NAMES[input.role];
    const defaultGroup = await prisma.projectPermissionGroup.findFirst({
      where: { projectId: input.projectId, name: defaultName },
    });
    if (defaultGroup) resolvedGroupId = defaultGroup.id;
  }

  // Find or create organization
  let org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: orgName } });
  }

  // Find or invite user via Supabase Admin
  let dbUser = await prisma.user.findUnique({ where: { email } });
  let inviteEmailSent = false;

  if (!dbUser) {
    const supabaseAdmin = getSupabaseAdmin();
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
      "http://localhost:3000";

    // Generate the invite link without letting Supabase send an email.
    // We deliver it ourselves via Resend so the template is consistent with
    // the rest of the app and routes through our own domain.
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          data: { name: name || email },
          redirectTo: `${appUrl}/auth/confirm`,
        },
      });

    if (linkError || !linkData?.user) {
      throw new Error(
        `Erreur lors de la génération du lien d'invitation : ${linkError?.message ?? "inconnue"}`,
      );
    }

    dbUser = await prisma.user.create({
      data: {
        id: linkData.user.id,
        email,
        name: name || null,
      },
    });

    // Fetch the project name for the email subject line
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { name: true },
    });

    await sendEmail({
      to: email,
      subject: `Invitation à rejoindre ${project?.name ?? "un projet"} — Aurem Gestion Financière`,
      react: React.createElement(MemberInviteEmail, {
        inviteLink: linkData.properties.action_link,
        projectName: project?.name ?? "Aurem Gestion Financière",
        recipientName: name || undefined,
      }),
    });

    inviteEmailSent = true;
  }

  // Ensure UserOrganization link exists (idempotent)
  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: { userId: dbUser.id, organizationId: org.id },
    },
    update: {},
    create: { userId: dbUser.id, organizationId: org.id },
  });

  // Check existing membership for this (user, project, org) — unique in schema
  const existing = await prisma.projectMember.findUnique({
    where: {
      userId_projectId_organizationId: {
        userId: dbUser.id,
        projectId: input.projectId,
        organizationId: org.id,
      },
    },
  });
  if (existing) {
    throw new Error(
      "Ce membre est déjà présent dans ce projet avec cette organisation.",
    );
  }

  await prisma.projectMember.create({
    data: {
      projectId: input.projectId,
      userId: dbUser.id,
      organizationId: org.id,
      role: input.role,
      permissionGroupId: resolvedGroupId,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true, inviteEmailSent };
}

export async function updateProjectMemberAction(input: {
  projectId: string;
  targetProjectMemberId: string;
  role: ProjectRole;
  permissionGroupId: string | null;
}) {
  const { pm: callerPm } = await requireAdmin(input.projectId);

  // Validate group if provided
  if (input.permissionGroupId) {
    const g = await prisma.projectPermissionGroup.findFirst({
      where: { id: input.permissionGroupId, projectId: input.projectId },
    });
    if (!g) throw new Error("Groupe de permissions invalide.");
  }

  // Safety: simulate post-change and ensure at least one admin remains
  const members = await loadMembersForAdminCheck(input.projectId);
  const newGroupCaps = await groupCapabilities(input.permissionGroupId);

  let remainingAdmins = 0;
  for (const m of members) {
    if (m.id === input.targetProjectMemberId) {
      if (memberIsAdmin(m, { permissionGroupCapabilities: newGroupCaps })) {
        remainingAdmins++;
      }
    } else if (memberIsAdmin(m)) {
      remainingAdmins++;
    }
  }

  if (remainingAdmins === 0) {
    throw new Error(
      "Action bloquée : un projet doit toujours conserver au moins un administrateur.",
    );
  }

  // Self-lockout warning: if caller is modifying themselves in a way that removes
  // their admin capability, block it regardless (must be done by another admin).
  if (input.targetProjectMemberId === callerPm.id) {
    const self = members.find((m) => m.id === callerPm.id);
    if (self && !memberIsAdmin(self, { permissionGroupCapabilities: newGroupCaps })) {
      throw new Error(
        "Vous ne pouvez pas retirer votre propre accès administrateur. Demandez à un autre administrateur d'effectuer ce changement.",
      );
    }
  }

  await prisma.projectMember.update({
    where: { id: input.targetProjectMemberId },
    data: {
      role: input.role,
      permissionGroupId: input.permissionGroupId || null,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function removeProjectMemberAction(input: {
  projectId: string;
  targetProjectMemberId: string;
}) {
  const { pm: callerPm } = await requireAdmin(input.projectId);

  if (input.targetProjectMemberId === callerPm.id) {
    throw new Error(
      "Vous ne pouvez pas vous retirer vous-même du projet. Demandez à un autre administrateur de le faire.",
    );
  }

  // Safety: ensure at least one admin remains after removal
  const members = await loadMembersForAdminCheck(input.projectId);
  const target = members.find((m) => m.id === input.targetProjectMemberId);
  if (!target) throw new Error("Membre introuvable.");

  let remainingAdmins = 0;
  for (const m of members) {
    if (m.id === input.targetProjectMemberId) continue;
    if (memberIsAdmin(m)) remainingAdmins++;
  }
  if (remainingAdmins === 0) {
    throw new Error(
      "Action bloquée : ce membre est le dernier administrateur du projet.",
    );
  }

  // Delete member. Related rows (FtmRecord.initiator, chat authors, reviews,
  // demands) use SET NULL by default in the schema — history is preserved.
  // Capability overrides cascade.
  await prisma.projectMember.delete({
    where: { id: input.targetProjectMemberId },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}
