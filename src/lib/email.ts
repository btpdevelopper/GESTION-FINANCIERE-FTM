import { Resend } from "resend";
import * as React from "react";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM =
  process.env.EMAIL_FROM ??
  "Aurem Gestion Financiere <noreply@contact.aurem-test-dev.site>";

/**
 * Single email dispatcher — uses the Resend SDK (not raw fetch).
 * Never throws; returns { ok: false, error } if delivery fails so callers
 * can log and continue without aborting the business action.
 */
export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
}): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[sendEmail] RESEND_API_KEY is not set — email skipped:", subject);
    return { ok: false, error: "RESEND_API_KEY missing" };
  }

  try {
    const recipients = Array.isArray(to) ? to : [to];
    const { error } = await resend.emails.send({
      from: FROM,
      to: recipients,
      subject,
      react,
    });

    if (error) {
      console.error("[sendEmail] Resend error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    console.error("[sendEmail] Unexpected error:", err);
    return { ok: false, error: String(err) };
  }
}
