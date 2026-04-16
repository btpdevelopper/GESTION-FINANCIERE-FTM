import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`UPDATE "FtmRecord" SET phase = 'ETUDES' WHERE phase IN ('CREATION', 'DRAFT')`);
    console.log("Updated FTMs");
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
