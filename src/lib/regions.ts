/** Stable region keys are shared by UI, offline drafts and server validation. */
export const REGIONS = ["garden_route", "eastern_cape", "transvaal", "kaap", "durban"] as const;
export type Region = typeof REGIONS[number];
export const REGION_LABELS: Record<Region, string> = {
  garden_route: "Garden Route",
  eastern_cape: "Eastern Cape",
  transvaal: "TRANSVAAL",
  kaap: "KAAP",
  durban: "DURBAN",
};
export const REGION_OPTIONS = REGIONS.map(value => ({ value, label: REGION_LABELS[value] }));
export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && REGIONS.some(region => region === value);
}
export function getRegionLabel(value: string | null | undefined): string | null {
  return isRegion(value) ? REGION_LABELS[value] : null;
}

/** Optional array is canonical; legacy single-region accounts need no migration. */
export function getUserRegions(user: { region?: Region | null; regions?: readonly Region[] } | null | undefined): Region[] {
  const values = user?.regions ?? (user?.region ? [user.region] : []);
  return [...new Set(values.filter(isRegion))];
}
export function getUserRegionOptions(user: { role: string; region?: Region | null; regions?: readonly Region[] } | null | undefined) {
  const allowed = getUserRegions(user);
  return REGION_OPTIONS.filter(option => user?.role === "admin" || allowed.includes(option.value));
}
