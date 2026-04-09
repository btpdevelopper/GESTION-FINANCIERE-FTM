import { PrismaClient, ProjectRole, Capability } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst();

  if (!user) {
    console.error("Aucun utilisateur trouvé dans la base. Veuillez d'abord insérer un utilisateur.");
    process.exit(1);
  }

  console.log(`Création d'un projet de démo pour l'utilisateur: ${user.email}`);

  const myOrg = await prisma.organization.create({
    data: { name: "Mon Entreprise MOE" },
  });

  await prisma.userOrganization.create({
    data: { userId: user.id, organizationId: myOrg.id },
  });

  const project = await prisma.project.create({
    data: {
      name: "Chantier Alpha",
      code: "ALPHA-01",
    },
  });

  // Groupes de droits
  const gMoe = await prisma.projectPermissionGroup.create({
    data: {
      projectId: project.id,
      name: "MOE - Full Admin",
      capabilities: {
        create: [
          { capability: Capability.VIEW_GLOBAL_FINANCE },
          { capability: Capability.VIEW_OWN_SCOPE },
          { capability: Capability.CREATE_FTM },
          { capability: Capability.APPROVE_FTM_CREATION_MOE },
          { capability: Capability.EDIT_ETUDES },
          { capability: Capability.INVITE_ETUDES_PARTICIPANT },
          { capability: Capability.SET_DEADLINES_AFTER_ETUDES },
          { capability: Capability.POST_FTM_CHAT },
          { capability: Capability.ANALYZE_QUOTE_MOE },
          { capability: Capability.ADMIN_PROJECT_PERMISSIONS },
        ]
      }
    }
  });

  // Assigner l'utilisateur au projet
  await prisma.projectMember.create({
    data: {
      userId: user.id,
      projectId: project.id,
      organizationId: myOrg.id,
      role: ProjectRole.MOE,
      permissionGroupId: gMoe.id
    }
  });

  console.log("Projet 'Chantier Alpha' créé avec succès !");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
