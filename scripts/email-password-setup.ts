/**
 * One-shot cutover mailer: sends a "set your password" email to every User
 * whose passwordHash is null (i.e. they were imported from Supabase but never
 * set a password on the new system). Idempotent — safe to re-run; old tokens
 * remain valid until they expire (1 week).
 *
 * Usage:
 *   npx tsx scripts/email-password-setup.ts                   # all users
 *   npx tsx scripts/email-password-setup.ts --email a@b.com   # single user
 *   npx tsx scripts/email-password-setup.ts --dry-run         # list, don't send
 *   npx tsx scripts/email-password-setup.ts --email moa@demo.local --print
 *     # mints a token and prints the URL to stdout instead of mailing
 *     # (useful for *.demo.local addresses or any non-deliverable inbox)
 */

import "dotenv/config";
import * as React from "react";
import { PrismaClient } from "@prisma/client";
import { createResetToken } from "../src/lib/auth/tokens";
import { sendEmail } from "../src/lib/email";
import { PasswordResetEmail } from "../src/emails/password-reset";

const prisma = new PrismaClient();
const TTL_MIN = 60 * 24 * 7; // 1 week

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const onlyEmail = arg("--email");
  const dryRun = process.argv.includes("--dry-run");
  const printOnly = process.argv.includes("--print");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  // Bulk mode: only users without a password yet (cutover scenario).
  // Single-user mode (--email): always include them, even if a hash already exists,
  // so this also works as a manual reset for any account.
  const users = await prisma.user.findMany({
    where: onlyEmail
      ? { email: onlyEmail.toLowerCase() }
      : { passwordHash: null },
    select: { id: true, email: true },
  });

  const label = onlyEmail ? "matching user(s)" : "user(s) with no password";
  console.log(`Found ${users.length} ${label}.`);
  if (dryRun) {
    users.forEach((u) => console.log("  " + u.email));
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    try {
      const rawToken = await createResetToken(u.id, TTL_MIN);
      const resetLink = `${appUrl}/auth/set-password?token=${encodeURIComponent(rawToken)}&first=1`;

      if (printOnly) {
        console.log(`  ${u.email}\n    ${resetLink}`);
        sent++;
        continue;
      }

      const result = await sendEmail({
        to: u.email,
        subject: "Définissez votre mot de passe — Aurem Gestion Financière",
        react: React.createElement(PasswordResetEmail, {
          resetLink,
          isFirstConnection: true,
        }),
      });
      if (!result.ok) throw new Error(result.error ?? "unknown email error");
      console.log(`  sent: ${u.email}`);
      sent++;
    } catch (err) {
      console.error(`  FAIL: ${u.email}:`, err);
      failed++;
    }
  }

  console.log(`\nDone. sent=${sent} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
