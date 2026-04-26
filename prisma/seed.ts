import 'dotenv/config';
import { PrismaClient, ProjectRole, Capability } from "@prisma/client";
import { hash as hashArgon2 } from "@node-rs/argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hashArgon2("password123");
  const emailVerified = new Date();

  const moaOrg = await prisma.organization.upsert({
    where: { slug: "demo-moa" },
    update: {},
    create: { name: "MOA Démo", slug: "demo-moa" },
  });
  const moeOrg = await prisma.organization.upsert({
    where: { slug: "demo-moe" },
    update: {},
    create: { name: "MOE Démo", slug: "demo-moe" },
  });
  const entA = await prisma.organization.upsert({
    where: { slug: "demo-ent-a" },
    update: {},
    create: { name: "Entreprise A", slug: "demo-ent-a" },
  });
  const entB = await prisma.organization.upsert({
    where: { slug: "demo-ent-b" },
    update: {},
    create: { name: "Entreprise B", slug: "demo-ent-b" },
  });

  const userMoa = await prisma.user.upsert({
    where: { email: "moa@demo.local" },
    update: { passwordHash, emailVerified, isAdmin: true },
    create: { email: "moa@demo.local", name: "Utilisateur MOA", isAdmin: true, passwordHash, emailVerified },
  });
  const userMoe = await prisma.user.upsert({
    where: { email: "moe@demo.local" },
    update: { passwordHash, emailVerified },
    create: { email: "moe@demo.local", name: "Utilisateur MOE", passwordHash, emailVerified },
  });
  const userE1 = await prisma.user.upsert({
    where: { email: "ent1@demo.local" },
    update: { passwordHash, emailVerified },
    create: { email: "ent1@demo.local", name: "Chef Ent. A", passwordHash, emailVerified },
  });
  const userE2 = await prisma.user.upsert({
    where: { email: "ent2@demo.local" },
    update: { passwordHash, emailVerified },
    create: { email: "ent2@demo.local", name: "Chef Ent. B", passwordHash, emailVerified },
  });

  for (const [u, o] of [
    [userMoa.id, moaOrg.id],
    [userMoe.id, moeOrg.id],
    [userE1.id, entA.id],
    [userE2.id, entB.id],
  ] as const) {
    await prisma.userOrganization.upsert({
      where: { userId_organizationId: { userId: u, organizationId: o } },
      update: {},
      create: { userId: u, organizationId: o },
    });
  }

  const project = await prisma.project.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Chantier démo",
      code: "DEMO-01",
    },
  });

  await prisma.baseContract.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id,
      label: "Marché de base",
      amountHtCents: BigInt(150000000),
      signatureDate: new Date("2024-06-01"),
    },
  });

  async function seedGroup(name: string, caps: Capability[]) {
    const g = await prisma.projectPermissionGroup.create({
      data: {
        projectId: project.id,
        name,
        capabilities: {
          create: caps.map((c) => ({ capability: c })),
        },
      },
    });
    return g;
  }

  const moaCaps: Capability[] = [
    Capability.VIEW_GLOBAL_FINANCE,
    Capability.VIEW_OWN_SCOPE,
    Capability.CREATE_FTM,
    Capability.EDIT_ETUDES,
    Capability.INVITE_ETUDES_PARTICIPANT,
    Capability.VALIDATE_ETUDES_MOA,
    Capability.SET_DEADLINES_AFTER_ETUDES,
    Capability.POST_FTM_CHAT,
    Capability.FINAL_VALIDATE_QUOTE_MOA,
    Capability.ADMIN_PROJECT_PERMISSIONS,
    Capability.VALIDATE_SITUATION_MOA,
    Capability.VALIDATE_FORECAST_MOA,
  ];
  const moeCaps: Capability[] = [
    Capability.VIEW_GLOBAL_FINANCE,
    Capability.VIEW_OWN_SCOPE,
    Capability.CREATE_FTM,
    Capability.APPROVE_FTM_CREATION_MOE,
    Capability.EDIT_ETUDES,
    Capability.INVITE_ETUDES_PARTICIPANT,
    Capability.SET_DEADLINES_AFTER_ETUDES,
    Capability.POST_FTM_CHAT,
    Capability.ANALYZE_QUOTE_MOE,
    Capability.REVIEW_SITUATION_MOE,
    Capability.REVIEW_FORECAST_MOE,
    Capability.CONFIGURE_CONTRACT_SETTINGS,
  ];
  const entCaps: Capability[] = [
    Capability.VIEW_OWN_SCOPE,
    Capability.CREATE_FTM,
    Capability.SUBMIT_QUOTE,
    Capability.POST_FTM_CHAT,
    Capability.SUBMIT_SITUATION,
    Capability.SUBMIT_FORECAST,
  ];

  let gMoa = await prisma.projectPermissionGroup.findFirst({
    where: { projectId: project.id, name: "MOA — défaut" },
  });
  let gMoe = await prisma.projectPermissionGroup.findFirst({
    where: { projectId: project.id, name: "MOE — défaut" },
  });
  let gEnt = await prisma.projectPermissionGroup.findFirst({
    where: { projectId: project.id, name: "Entreprise — défaut" },
  });
  if (!gMoa) gMoa = await seedGroup("MOA — défaut", moaCaps);
  if (!gMoe) gMoe = await seedGroup("MOE — défaut", moeCaps);
  if (!gEnt) gEnt = await seedGroup("Entreprise — défaut", entCaps);
  if (!gMoa || !gMoe || !gEnt) throw new Error("Seed: groupes de permissions manquants.");

  const pmMoa = await prisma.projectMember.upsert({
    where: {
      userId_projectId_organizationId: {
        userId: userMoa.id,
        projectId: project.id,
        organizationId: moaOrg.id,
      },
    },
    update: { permissionGroupId: gMoa.id, role: ProjectRole.MOA },
    create: {
      userId: userMoa.id,
      projectId: project.id,
      organizationId: moaOrg.id,
      role: ProjectRole.MOA,
      permissionGroupId: gMoa.id,
    },
  });
  const pmMoe = await prisma.projectMember.upsert({
    where: {
      userId_projectId_organizationId: {
        userId: userMoe.id,
        projectId: project.id,
        organizationId: moeOrg.id,
      },
    },
    update: { permissionGroupId: gMoe.id, role: ProjectRole.MOE },
    create: {
      userId: userMoe.id,
      projectId: project.id,
      organizationId: moeOrg.id,
      role: ProjectRole.MOE,
      permissionGroupId: gMoe.id,
    },
  });
  const pmE1 = await prisma.projectMember.upsert({
    where: {
      userId_projectId_organizationId: {
        userId: userE1.id,
        projectId: project.id,
        organizationId: entA.id,
      },
    },
    update: { permissionGroupId: gEnt.id, role: ProjectRole.ENTREPRISE },
    create: {
      userId: userE1.id,
      projectId: project.id,
      organizationId: entA.id,
      role: ProjectRole.ENTREPRISE,
      permissionGroupId: gEnt.id,
    },
  });
  const pmE2 = await prisma.projectMember.upsert({
    where: {
      userId_projectId_organizationId: {
        userId: userE2.id,
        projectId: project.id,
        organizationId: entB.id,
      },
    },
    update: { permissionGroupId: gEnt.id, role: ProjectRole.ENTREPRISE },
    create: {
      userId: userE2.id,
      projectId: project.id,
      organizationId: entB.id,
      role: ProjectRole.ENTREPRISE,
      permissionGroupId: gEnt.id,
    },
  });

  const lotGrosOeuvre = await prisma.projectLot.create({
    data: {
      projectId: project.id,
      label: "Lot Gros œuvre",
    },
  });
  const lotCvc = await prisma.projectLot.create({
    data: {
      projectId: project.id,
      label: "Lot CVC",
    },
  });

  await prisma.projectLotOrganization.create({
    data: {
      projectLotId: lotGrosOeuvre.id,
      organizationId: entA.id,
      montantMarcheHtCents: BigInt(40000000),
    },
  });
  await prisma.projectLotOrganization.create({
    data: {
      projectLotId: lotCvc.id,
      organizationId: entB.id,
      montantMarcheHtCents: BigInt(25000000),
    },
  });

  // Deny example: entreprise 1 cannot create FTM (deny wins)
  await prisma.projectMemberCapabilityOverride.upsert({
    where: {
      projectMemberId_capability: {
        projectMemberId: pmE1.id,
        capability: Capability.CREATE_FTM,
      },
    },
    update: { allowed: false },
    create: {
      projectMemberId: pmE1.id,
      capability: Capability.CREATE_FTM,
      allowed: false,
    },
  });

  console.log("Seed OK — comptes démo :");
  console.log("  moa@demo.local / moe@demo.local / ent1@demo.local / ent2@demo.local");
  console.log("  mot de passe : password123");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
