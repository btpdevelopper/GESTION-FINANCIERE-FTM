"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";
import {
  checkSignInRateLimit,
  clearSignInFailures,
  getClientIp,
  recordLoginAttempt,
} from "@/lib/auth/rate-limit";
import { isTurnstileConfigured, verifyTurnstileToken } from "@/lib/auth/turnstile";

// Accept only same-origin relative paths. Reject `//evil.com`, `https://...`,
// or anything that does not start with a single `/`.
function safeCallbackUrl(raw: string | undefined): string {
  if (!raw) return "/projects";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/projects";
  }
  return raw;
}

export type SignInActionResult =
  | { ok: true }
  | { ok: false; error: string; requireCaptcha?: boolean; retryAfterSec?: number };

export async function signInAction(formData: {
  email: string;
  password: string;
  callbackUrl?: string;
  turnstileToken?: string;
}): Promise<SignInActionResult> {
  const email = formData.email.toLowerCase().trim();
  const ip = await getClientIp();

  const rl = await checkSignInRateLimit({ email, ip });
  if (!rl.allowed) {
    return {
      ok: false,
      error: "Trop de tentatives de connexion. Réessayez plus tard.",
      retryAfterSec: rl.retryAfterSec,
    };
  }

  const captchaRequired = rl.requireCaptcha && isTurnstileConfigured();
  if (captchaRequired) {
    if (!formData.turnstileToken) {
      return {
        ok: false,
        requireCaptcha: true,
        error: "Confirmez que vous n'êtes pas un robot.",
      };
    }
    const verified = await verifyTurnstileToken(formData.turnstileToken, ip);
    if (!verified) {
      await recordLoginAttempt({ kind: "SIGN_IN", email, ip, success: false });
      return {
        ok: false,
        requireCaptcha: true,
        error: "Vérification anti-robot échouée. Réessayez.",
      };
    }
  }

  try {
    await signIn("credentials", {
      email,
      password: formData.password,
      redirectTo: safeCallbackUrl(formData.callbackUrl),
    });
    // signIn throws NEXT_REDIRECT on success; this line is unreachable.
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      await recordLoginAttempt({ kind: "SIGN_IN", email, ip, success: false });
      // Re-check rate limit so the *next* response can flip on the captcha
      // requirement at the right threshold.
      const post = await checkSignInRateLimit({ email, ip });
      if (!post.allowed) {
        return {
          ok: false,
          error: "Trop de tentatives de connexion. Réessayez plus tard.",
          retryAfterSec: post.retryAfterSec,
        };
      }
      return {
        ok: false,
        error: "Email ou mot de passe incorrect.",
        requireCaptcha: post.requireCaptcha && isTurnstileConfigured(),
      };
    }
    // NEXT_REDIRECT path = successful sign-in. Record + clear, then re-throw
    // so Next.js performs the redirect.
    await recordLoginAttempt({ kind: "SIGN_IN", email, ip, success: true });
    await clearSignInFailures(email);
    throw err;
  }
}
