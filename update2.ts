import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`UPDATE "FtmRecord" SET "preCancellationPhase" = 'ETUDES' WHERE "preCancellationPhase" IN ('CREATION', 'DRAFT')`);
    console.log("Updated preCancellationPhase");
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
