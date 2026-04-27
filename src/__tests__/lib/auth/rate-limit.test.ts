import { describe, it, expect, vi, beforeEach } from "vitest";

const { counts, countMock } = vi.hoisted(() => {
  const counts: Record<string, number> = {};
  const countMock = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const key = JSON.stringify({
      kind: where.kind,
      email: where.email ?? null,
      ipHash: where.ipHash ?? null,
    });
    return counts[key] ?? 0;
  });
  return { counts, countMock };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    loginAttempt: {
      count: countMock,
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import {
  checkSignInRateLimit,
  checkPasswordResetRateLimit,
  hashIp,
} from "@/lib/auth/rate-limit";

beforeEach(() => {
  for (const k of Object.keys(counts)) delete counts[k];
  countMock.mockClear();
});

function setSignInFailures(opts: { email?: string; ipHash?: string; count: number }) {
  const key = JSON.stringify({
    kind: "SIGN_IN",
    email: opts.email ?? null,
    ipHash: opts.ipHash ?? null,
  });
  counts[key] = opts.count;
}

describe("hashIp", () => {
  it("is deterministic for the same ip", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });
  it("differs across ips", () => {
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("5.6.7.8"));
  });
});

describe("checkSignInRateLimit", () => {
  const email = "user@example.com";
  const ip = "203.0.113.10";

  it("allows fresh accounts without captcha", async () => {
    const r = await checkSignInRateLimit({ email, ip });
    expect(r).toEqual({ allowed: true, requireCaptcha: false });
  });

  it("requires captcha after 5 failures for the same email", async () => {
    setSignInFailures({ email, count: 5 });
    const r = await checkSignInRateLimit({ email, ip });
    expect(r).toEqual({ allowed: true, requireCaptcha: true });
  });

  it("does NOT require captcha at 4 failures (just below threshold)", async () => {
    setSignInFailures({ email, count: 4 });
    const r = await checkSignInRateLimit({ email, ip });
    expect(r).toEqual({ allowed: true, requireCaptcha: false });
  });

  it("blocks after 20 failures from the same IP", async () => {
    setSignInFailures({ ipHash: hashIp(ip), count: 20 });
    const r = await checkSignInRateLimit({ email, ip });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfterSec).toBe(15 * 60);
  });

  it("blocks after 10 failures for the same email within the long window", async () => {
    setSignInFailures({ email, count: 10 });
    const r = await checkSignInRateLimit({ email, ip });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfterSec).toBe(60 * 60);
  });

  it("IP block beats email-only captcha when both apply", async () => {
    setSignInFailures({ ipHash: hashIp(ip), count: 25 });
    setSignInFailures({ email, count: 5 });
    const r = await checkSignInRateLimit({ email, ip });
    expect(r.allowed).toBe(false);
  });
});

describe("checkPasswordResetRateLimit", () => {
  const email = "user@example.com";
  const ip = "203.0.113.10";

  it("allows up to threshold", async () => {
    const r = await checkPasswordResetRateLimit({ email, ip });
    expect(r.allowed).toBe(true);
  });

  it("blocks at 5 attempts per IP", async () => {
    counts[
      JSON.stringify({ kind: "PASSWORD_RESET_REQUEST", email: null, ipHash: hashIp(ip) })
    ] = 5;
    const r = await checkPasswordResetRateLimit({ email, ip });
    expect(r.allowed).toBe(false);
  });

  it("blocks at 3 attempts per email", async () => {
    counts[
      JSON.stringify({ kind: "PASSWORD_RESET_REQUEST", email, ipHash: null })
    ] = 3;
    const r = await checkPasswordResetRateLimit({ email, ip });
    expect(r.allowed).toBe(false);
  });
});
