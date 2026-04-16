const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    // We cannot use prisma.ftmRecord.updateMany if phase isn't listed in generated client properly,
    // so we use raw query
    await prisma.$executeRawUnsafe(`UPDATE "FtmRecord" SET phase = 'ETUDES' WHERE phase IN ('CREATION', 'DRAFT')`);
    console.log("Updated FTMs");
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
