"use server";

import { revalidatePath } from "next/cache";
import { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { DEFAULT_GROUP_NAMES, DEFAULT_ROLE_CAPABILITIES } from "@/lib/permissions/defaults";

// Assumes role enum comes from prisma
type Role = "MOA" | "MOE" | "ENTREPRISE";

export async function createProjectExecutionAction(input: {
  name: string;
  code?: string;
  lots: {
    label: string;
    description?: string;
    organizations: {
      organizationName: string;
      montantMarcheHtCents: string;
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

  // Init Supabase Admin purely for user creation
  const defaultSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!defaultSupabaseUrl || !serviceRoleKey) {
    throw new Error("Configuration Supabase Admin manquante sur le serveur.");
  }
  const supabaseAdmin = createClient(defaultSupabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
    for (const name of Array.from(orgNames)) {
      let org = await tx.organization.findFirst({ where: { name } });
      if (!org) {
        org = await tx.organization.create({ data: { name } });
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

    // 4. Process Users
    for (const u of input.users) {
      const orgId = orgMap.get(u.organizationName);
      if (!orgId) continue;

      let dbUser = await tx.user.findUnique({ where: { email: u.email } });
      
      if (!dbUser) {
        // Invite user securely via Supabase Auth (sends an invite email)
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          u.email,
          { data: { name: u.name } }
        );
        if (authError || !authData.user) {
          throw new Error(`Erreur création auth Supabase pour ${u.email}: ${authError?.message}`);
        }
        
        dbUser = await tx.user.create({
          data: {
            id: authData.user.id,
            email: u.email,
            name: u.name,
          },
        });
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

    return p;
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
