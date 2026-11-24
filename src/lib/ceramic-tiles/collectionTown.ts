/** Canonical pickup towns shared by dispatch instructions and SP eligibility. */
export function ceramicCollectionTown(value: string): string | null {
  const matches = value.match(/\b(KRUGERSDORP|VEREENIGING|BABALEGI|BABELEGI|HAMMANSKRAAL)\b/gi) ?? [];
  const towns = new Set(matches.map(town => /^(?:BABALEGI|BABELEGI|HAMMANSKRAAL)$/i.test(town) ? "BABELEGI" : town.toUpperCase()));
  return towns.size === 1 ? [...towns][0] : null;
}
