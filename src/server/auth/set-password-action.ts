"use server";

import { hash as hashArgon2 } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeResetToken } from "@/lib/auth/tokens";
import {
  checkSetPasswordRateLimit,
  getClientIp,
  recordLoginAttempt,
} from "@/lib/auth/rate-limit";

const schema = z.object({
  token: z.string().min(20).max(256),
  password: z.string().min(10, "Le mot de passe doit faire au moins 10 caractères.").max(128),
});

export async function setPasswordAction(input: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await getClientIp();

  const rl = await checkSetPasswordRateLimit(ip);
  if (!rl.allowed) {
    return { ok: false, error: "Trop de tentatives. Réessayez plus tard." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    await recordLoginAttempt({ kind: "PASSWORD_SET", ip, success: false });
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const userId = await consumeResetToken(parsed.data.token);
  if (!userId) {
    await recordLoginAttempt({ kind: "PASSWORD_SET", ip, success: false });
    return { ok: false, error: "Lien invalide ou expiré. Demandez un nouveau lien." };
  }

  const passwordHash = await hashArgon2(parsed.data.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, emailVerified: new Date() },
  });

  await recordLoginAttempt({ kind: "PASSWORD_SET", ip, success: true });
  return { ok: true };
}
