"use server";

import { hash as hashArgon2 } from "@node-rs/argon2";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeResetToken } from "@/lib/auth/tokens";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(10, "Le mot de passe doit faire au moins 10 caractères."),
});

export async function setPasswordAction(input: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }

  const userId = await consumeResetToken(parsed.data.token);
  if (!userId) {
    return { ok: false, error: "Lien invalide ou expiré. Demandez un nouveau lien." };
  }

  const passwordHash = await hashArgon2(parsed.data.password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, emailVerified: new Date() },
  });

  return { ok: true };
}
