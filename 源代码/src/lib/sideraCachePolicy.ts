export const SIDERA_CACHE_POLICY_VERSION = 2;

export type SideraCachePolicyInput = {
  sideraCacheRetention?: unknown;
  sideraCachePolicyVersion?: unknown;
};

export type ResolvedSideraCachePolicy = {
  sideraCacheRetention: "auto" | "long";
  sideraCachePolicyVersion: number;
  migrated: boolean;
};

export function resolveSideraCachePolicy(
  settings: SideraCachePolicyInput,
): ResolvedSideraCachePolicy {
  const migrated = settings.sideraCachePolicyVersion !== SIDERA_CACHE_POLICY_VERSION;
  return {
    sideraCacheRetention: !migrated && settings.sideraCacheRetention === "auto" ? "auto" : "long",
    sideraCachePolicyVersion: SIDERA_CACHE_POLICY_VERSION,
    migrated,
  };
}
