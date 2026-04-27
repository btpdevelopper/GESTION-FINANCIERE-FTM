import "server-only";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { LoginAttemptKind } from "@prisma/client";

const SIGN_IN_IP_WINDOW_MS = 15 * 60 * 1000;
const SIGN_IN_IP_BLOCK_THRESHOLD = 20;
const SIGN_IN_EMAIL_CAPTCHA_WINDOW_MS = 15 * 60 * 1000;
const SIGN_IN_EMAIL_CAPTCHA_THRESHOLD = 5;
const SIGN_IN_EMAIL_BLOCK_WINDOW_MS = 60 * 60 * 1000;
const SIGN_IN_EMAIL_BLOCK_THRESHOLD = 10;

const RESET_IP_WINDOW_MS = 60 * 60 * 1000;
const RESET_IP_BLOCK_THRESHOLD = 5;
const RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const RESET_EMAIL_BLOCK_THRESHOLD = 3;

const SET_IP_WINDOW_MS = 60 * 60 * 1000;
const SET_IP_BLOCK_THRESHOLD = 10;

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = h.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return createHash("sha256").update(`${ip}|${salt}`).digest("hex");
}

export async function recordLoginAttempt(args: {
  kind: LoginAttemptKind;
  email?: string | null;
  ip: string;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      kind: args.kind,
      email: args.email ? args.email.toLowerCase() : null,
      ipHash: hashIp(args.ip),
      success: args.success,
    },
  });
}

async function countFailures(opts: {
  kind: LoginAttemptKind;
  windowMs: number;
  email?: string;
  ipHash?: string;
}): Promise<number> {
  const since = new Date(Date.now() - opts.windowMs);
  return prisma.loginAttempt.count({
    where: {
      kind: opts.kind,
      success: false,
      createdAt: { gt: since },
      ...(opts.email ? { email: opts.email } : {}),
      ...(opts.ipHash ? { ipHash: opts.ipHash } : {}),
    },
  });
}

export type SignInRateLimitResult =
  | { allowed: true; requireCaptcha: boolean }
  | { allowed: false; requireCaptcha: false; retryAfterSec: number };

export async function checkSignInRateLimit(args: {
  email: string;
  ip: string;
}): Promise<SignInRateLimitResult> {
  const email = args.email.toLowerCase();
  const ipHash = hashIp(args.ip);

  const [ipFails, emailCaptchaFails, emailBlockFails] = await Promise.all([
    countFailures({ kind: "SIGN_IN", windowMs: SIGN_IN_IP_WINDOW_MS, ipHash }),
    countFailures({ kind: "SIGN_IN", windowMs: SIGN_IN_EMAIL_CAPTCHA_WINDOW_MS, email }),
    countFailures({ kind: "SIGN_IN", windowMs: SIGN_IN_EMAIL_BLOCK_WINDOW_MS, email }),
  ]);

  if (ipFails >= SIGN_IN_IP_BLOCK_THRESHOLD) {
    return { allowed: false, requireCaptcha: false, retryAfterSec: SIGN_IN_IP_WINDOW_MS / 1000 };
  }
  if (emailBlockFails >= SIGN_IN_EMAIL_BLOCK_THRESHOLD) {
    return { allowed: false, requireCaptcha: false, retryAfterSec: SIGN_IN_EMAIL_BLOCK_WINDOW_MS / 1000 };
  }

  return { allowed: true, requireCaptcha: emailCaptchaFails >= SIGN_IN_EMAIL_CAPTCHA_THRESHOLD };
}

export async function clearSignInFailures(email: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({
    where: { kind: "SIGN_IN", success: false, email: email.toLowerCase() },
  });
}

export async function checkPasswordResetRateLimit(args: {
  email: string;
  ip: string;
}): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const email = args.email.toLowerCase();
  const ipHash = hashIp(args.ip);

  const [ipFails, emailFails] = await Promise.all([
    prisma.loginAttempt.count({
      where: {
        kind: "PASSWORD_RESET_REQUEST",
        ipHash,
        createdAt: { gt: new Date(Date.now() - RESET_IP_WINDOW_MS) },
      },
    }),
    prisma.loginAttempt.count({
      where: {
        kind: "PASSWORD_RESET_REQUEST",
        email,
        createdAt: { gt: new Date(Date.now() - RESET_EMAIL_WINDOW_MS) },
      },
    }),
  ]);

  if (ipFails >= RESET_IP_BLOCK_THRESHOLD) {
    return { allowed: false, retryAfterSec: RESET_IP_WINDOW_MS / 1000 };
  }
  if (emailFails >= RESET_EMAIL_BLOCK_THRESHOLD) {
    return { allowed: false, retryAfterSec: RESET_EMAIL_WINDOW_MS / 1000 };
  }
  return { allowed: true };
}

export async function checkSetPasswordRateLimit(
  ip: string
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const ipHash = hashIp(ip);
  const fails = await countFailures({
    kind: "PASSWORD_SET",
    windowMs: SET_IP_WINDOW_MS,
    ipHash,
  });
  if (fails >= SET_IP_BLOCK_THRESHOLD) {
    return { allowed: false, retryAfterSec: SET_IP_WINDOW_MS / 1000 };
  }
  return { allowed: true };
}
