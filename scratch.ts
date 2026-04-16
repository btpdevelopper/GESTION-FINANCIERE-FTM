import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  await prisma.ftmRecord.findFirst({
    where: { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", projectId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" },
    include: {
      chatMessages: {
        where: { targetOrganizationId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }
      }
    }
  });
  console.log("Success");
}
main().catch(console.error).finally(() => prisma.$disconnect());
