import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32; // 256-bit random; base64url-encoded → 43 chars

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a one-time token for invite activation or password reset.
 * Returns the raw token (only shown to the recipient via email);
 * the DB stores only sha256(raw) so a leaked DB cannot replay tokens.
 */
export async function createResetToken(
  userId: string,
  ttlMinutes: number = 60
): Promise<string> {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return raw;
}

/**
 * Atomically validate + consume a token. Returns the userId on success,
 * null on any failure (unknown / expired / already used). Single-use:
 * the conditional update fails its WHERE clause on a second attempt.
 */
export async function consumeResetToken(rawToken: string): Promise<string | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const tokenHash = hashToken(rawToken);

  const result = await prisma.passwordResetToken.updateMany({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });

  if (result.count !== 1) return null;

  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { userId: true },
  });
  return row?.userId ?? null;
}
