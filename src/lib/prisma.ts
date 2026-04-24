import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prismaBase: PrismaClient | undefined };

const prismaBase =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = prismaBase;

// NOTE: Supabase RLS extension is disabled.
// RLS is enabled on tables but no Postgres policies are defined yet.
// The app enforces access control via application-level RBAC
// (resolveCapabilities / requireProjectMember in server actions).
// When proper RLS policies are created in Supabase, re-enable the
// Prisma Client Extension that injects JWT claims via set_config.
export const prisma = prismaBase;

