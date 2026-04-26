"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function signInAction(formData: { email: string; password: string; callbackUrl?: string }) {
  try {
    await signIn("credentials", {
      email: formData.email.toLowerCase().trim(),
      password: formData.password,
      redirectTo: formData.callbackUrl || "/projects",
    });
    // signIn throws NEXT_REDIRECT on success; this line is unreachable.
    return { ok: true as const };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false as const, error: "Email ou mot de passe incorrect." };
    }
    throw err; // re-throw NEXT_REDIRECT and other framework errors
  }
}
