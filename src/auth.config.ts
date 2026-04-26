import type { NextAuthConfig } from "next-auth";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/inngest",
  "/api/auth", // Auth.js own endpoints
  "/invite",
  "/auth/set-password",
  "/auth/forgot-password",
];

/**
 * Edge-safe Auth.js config. Holds everything the middleware needs (callbacks,
 * route guarding, session strategy) but no Node-only modules — Prisma and
 * `@node-rs/argon2` live in the full config in `src/auth.ts`.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // Credentials added in src/auth.ts
  callbacks: {
    authorized: ({ auth, request }) => {
      const path = request.nextUrl.pathname;
      const isPublic = PUBLIC_PREFIXES.some(
        (p) => path === p || path.startsWith(p + "/")
      );
      if (isPublic) return true;
      if (!auth?.user) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("callbackUrl", path);
        return Response.redirect(url);
      }
      return true;
    },
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
      }
      return token;
    },
    session: ({ session, token }) => {
      if (token.id) session.user.id = token.id as string;
      session.user.isAdmin = (token.isAdmin as boolean | undefined) ?? false;
      return session;
    },
  },
} satisfies NextAuthConfig;
