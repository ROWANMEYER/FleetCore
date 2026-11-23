export const DRAFT_KEY_PREFIX = "fleetcore:draft";
export const DRAFT_KEY_VERSION = 1;
export const UNSCOPED_SEGMENT = "unscoped";

const MAX_SEGMENT_LENGTH = 64;

export type DraftScope = {
  workflow: string;
  userId: string | null | undefined;
  region?: string | null;
};

export function sanitizeScopeSegment(
  value: string | null | undefined,
  fallback: string
): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return fallback;
  return cleaned.length > MAX_SEGMENT_LENGTH
    ? cleaned.slice(0, MAX_SEGMENT_LENGTH)
    : cleaned;
}

export type DraftRegionUser = {
  role: "admin" | "regional";
  region: string | null;
  regions?: string[];
};

export function resolveDraftRegion(
  user: DraftRegionUser | null | undefined,
  regionArg: string | null | undefined
): string {
  if (!user) return "unresolved";
  if (user.role === "regional") {
    const allowed = user.regions ?? (user.region ? [user.region] : []);
    return regionArg && allowed.includes(regionArg) ? regionArg : allowed[0] ?? "unassigned";
  }
  return regionArg ?? "all";
}

export function buildDraftKey(scope: DraftScope): string | null {
  const workflow = sanitizeScopeSegment(scope.workflow, "");
  if (!workflow) return null;
  const userId = sanitizeScopeSegment(scope.userId, "");
  if (!userId) return null;
  const region = sanitizeScopeSegment(scope.region, UNSCOPED_SEGMENT);
  return `${DRAFT_KEY_PREFIX}:${workflow}:u-${userId}:r-${region}:v${DRAFT_KEY_VERSION}`;
}
