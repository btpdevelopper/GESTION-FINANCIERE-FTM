import { PrismaClient } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";

const globalForPrisma = globalThis as unknown as { prismaBase: PrismaClient | undefined };

const prismaBase =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = prismaBase;

// Prisma Client Extension for Supabase RLS
export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        // Only run Supabase auth logic if we're not seeding or running maintenance outside Next request context
        try {
          const supabase = await createClient();
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.access_token) {
            const tokenPayload = session.access_token.split('.')[1];
            if (tokenPayload) {
              const jwtClaims = Buffer.from(tokenPayload, 'base64').toString('utf-8');
              
              // To enforce RLS, we wrap the operation in an interactive transaction
              // which sets the JWT configuration for that specific Postgres connection.
              return await prismaBase.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`SELECT set_config('request.jwt.claims', $1, TRUE)`, jwtClaims);
                // Execute the target query within the same transactional context
                return await (tx as any)[model][operation](args);
              });
            }
          }
        } catch (e) {
          // If createClient fails (e.g. out of request scope like seeding scripts), we fallback to service role natively
        }
        
        // Fallback for unauthenticated or system executions
        return query(args);
      },
    },
  },
});

