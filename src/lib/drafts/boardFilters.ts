import type { BoardStatusFilter } from "../planner/boardStats";

export const BOARD_FILTERS_WORKFLOW = "daily-planner:board-fleet-filters";

export type BoardFilters = {
  search: string;
  status: BoardStatusFilter;
};

export const DEFAULT_BOARD_FILTERS: BoardFilters = {
  search: "",
  status: "all",
};

const BOARD_STATUS_FILTERS: BoardStatusFilter[] = [
  "all",
  "planned",
  "ready",
  "available",
  "unavailable",
];

export function isBoardStatusFilter(value: unknown): value is BoardStatusFilter {
  return (
    typeof value === "string" &&
    (BOARD_STATUS_FILTERS as string[]).includes(value)
  );
}

export function sanitizeBoardFilters(value: unknown): BoardFilters | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return {
    search: typeof source.search === "string" ? source.search : DEFAULT_BOARD_FILTERS.search,
    status: isBoardStatusFilter(source.status) ? source.status : DEFAULT_BOARD_FILTERS.status,
  };
}
