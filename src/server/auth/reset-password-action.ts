"use server";

import * as React from "react";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";
import { createResetToken } from "@/lib/auth/tokens";

export async function sendPasswordResetAction(input: {
  email: string;
  isFirstConnection?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const email = input.email.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Adresse email invalide." };
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    // Silent success for unknown emails — prevents enumeration.
    if (!user) return { ok: true };

    const rawToken = await createResetToken(user.id, 60);
    const resetLink = `${appUrl}/auth/set-password?token=${encodeURIComponent(rawToken)}&first=${input.isFirstConnection ? 1 : 0}`;

    await sendEmail({
      to: email,
      subject: input.isFirstConnection
        ? "Définissez votre mot de passe — Aurem Gestion Financière"
        : "Réinitialisez votre mot de passe — Aurem Gestion Financière",
      react: React.createElement(PasswordResetEmail, {
        resetLink,
        isFirstConnection: input.isFirstConnection ?? false,
      }),
    });

    return { ok: true };
  } catch (err) {
    console.error("[sendPasswordResetAction] Unexpected error:", err);
    return { ok: true }; // silent fail
  }
}
