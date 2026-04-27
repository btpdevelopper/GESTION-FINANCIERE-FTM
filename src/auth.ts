import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify as verifyArgon2, hash as hashArgon2 } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
    } & DefaultSession["user"];
  }
  interface User {
    isAdmin?: boolean;
  }
}

const credentialsSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

// Cached dummy hash used to equalize argon2 verification time when the user
// does not exist, defeating account enumeration via timing.
let cachedDummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!cachedDummyHash) {
    cachedDummyHash = await hashArgon2("dummy-password-for-timing-equalization");
  }
  return cachedDummyHash;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) {
          console.warn("[AUTH] invalid credentials payload");
          return null;
        }

        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            isAdmin: true,
            passwordHash: true,
          },
        });

        if (!user || !user.passwordHash) {
          // Run a verify against a dummy hash so absent / passwordless users
          // take roughly the same time as a wrong-password attempt.
          await verifyArgon2(await getDummyHash(), parsed.data.password).catch(() => false);
          console.warn(`[AUTH FAILED] unknown account: ${email}`);
          return null;
        }

        const ok = await verifyArgon2(user.passwordHash, parsed.data.password);
        if (!ok) {
          console.warn(`[AUTH FAILED] wrong password for: ${email}`);
          return null;
        }

        console.info(`[AUTH SUCCESS] user=${user.id}`);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          isAdmin: user.isAdmin,
        };
      },
    }),
  ],
});
