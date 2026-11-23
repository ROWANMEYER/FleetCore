import { ConvexError } from "convex/values";
import type { Region } from "../regions";

type DispatchUser = { role: "admin" | "regional"; region: Region | null; regions?: Region[] };
export function ceramicAssignmentAccess(user: DispatchUser | null | undefined, region: Region): { allowed: boolean; message: string } {
  if (!user) return { allowed: false, message: "Sign in to assign this shipment to Daily Planner and reports." };
  void region;
  return { allowed: true, message: "" };
}
/** Only intentional application errors are shown; unexpected server details stay hidden. */
export function ceramicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") return data.message;
  }
  const reference = error instanceof Error ? /\[Request ID: ([a-f0-9]+)\]/i.exec(error.message)?.[1] : undefined;
  return reference ? `${fallback} Support reference: ${reference}.` : fallback;
}
