import { auth } from "@/auth";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  isAdmin: boolean;
}

/**
 * Returns the current session user or null. Same shape used by every
 * server action / page across the app — `user.id` and `user.email` are
 * the only fields exercised in practice.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    image: u.image ?? null,
    isAdmin: u.isAdmin ?? false,
  };
}
