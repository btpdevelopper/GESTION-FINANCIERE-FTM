import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const ALL_CAPABILITIES = Object.values(Capability) as Capability[];

export type EffectiveCapabilityMap = Record<Capability, boolean>;

/**
 * Deny wins: if any override sets allowed=false for a capability, result is false.
 * Otherwise: if override allows true, true; else group default.
 */
export async function resolveCapabilities(
  projectMemberId: string,
): Promise<EffectiveCapabilityMap> {
  const member = await prisma.projectMember.findUnique({
    where: { id: projectMemberId },
    include: {
      permissionGroup: {
        include: { capabilities: true },
      },
      capabilityOverrides: true,
    },
  });

  if (!member) {
    const none = {} as EffectiveCapabilityMap;
    for (const cap of ALL_CAPABILITIES) none[cap] = false;
    return none;
  }

  const groupSet = new Set(
    member.permissionGroup?.capabilities.map((c) => c.capability) ?? [],
  );
  const overrideMap = new Map(
    member.capabilityOverrides.map((o) => [o.capability, o.allowed]),
  );

  const result = {} as EffectiveCapabilityMap;
  for (const cap of ALL_CAPABILITIES) {
    const override = overrideMap.get(cap);
    if (override === false) {
      result[cap] = false;
      continue;
    }
    if (override === true) {
      result[cap] = true;
      continue;
    }
    result[cap] = groupSet.has(cap);
  }

  return result;
}

export async function can(
  projectMemberId: string,
  capability: Capability,
): Promise<boolean> {
  const map = await resolveCapabilities(projectMemberId);
  return map[capability] === true;
}

/** Fallback when no DB enum introspection (e.g. tests): merge group + overrides manually. */
export function mergeCapabilities(
  groupCaps: Capability[],
  overrides: { capability: Capability; allowed: boolean }[],
): Record<string, boolean> {
  const groupSet = new Set(groupCaps);
  const out: Record<string, boolean> = {};
  const all = new Set<Capability>([...groupCaps, ...overrides.map((o) => o.capability)]);
  for (const cap of all) {
    const ov = overrides.find((o) => o.capability === cap);
    if (ov?.allowed === false) {
      out[cap] = false;
    } else if (ov?.allowed === true) {
      out[cap] = true;
    } else {
      out[cap] = groupSet.has(cap);
    }
  }
  return out;
}
