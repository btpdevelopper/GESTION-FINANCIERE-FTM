"use server";

import * as React from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { PasswordResetEmail } from "@/emails/password-reset";

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
    const supabaseAdmin = getSupabaseAdmin();

    const { data, error: genError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/auth/confirm`,
      },
    });

    if (genError || !data?.properties?.action_link) {
      // Don't leak whether the email exists — return success regardless
      console.error("[sendPasswordResetAction] generateLink error:", genError?.message);
      return { ok: true }; // silent fail to prevent email enumeration
    }

    await sendEmail({
      to: email,
      subject: input.isFirstConnection
        ? "Définissez votre mot de passe — Aurem Gestion Financière"
        : "Réinitialisez votre mot de passe — Aurem Gestion Financière",
      react: React.createElement(PasswordResetEmail, {
        resetLink: data.properties.action_link,
        isFirstConnection: input.isFirstConnection ?? false,
      }),
    });

    return { ok: true };
  } catch (err) {
    console.error("[sendPasswordResetAction] Unexpected error:", err);
    return { ok: true }; // silent fail — don't expose server errors to the client
  }
}
