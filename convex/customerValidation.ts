/* Pure customer-master validation and status rules.

   Shared by convex/customers.ts and the unit tests. This file MUST stay
   dependency-free (no generated Convex imports) so it remains directly
   testable. Canonical normalization stays EXACTLY compatible with the
   existing `customers.normalizedName` behavior (toLowerCase + trim), which is
   also what Quick Capture matching relies on. */

export type CustomersRow = {
  _id: string;
  name: string;
  normalizedName: string;
  isActive: boolean;
};

/** Existing-account number uniqueness messages — preserved verbatim. */
export function accountNumberConflictMessage(
  accountNumber: string,
  existingName: string
): string {
  return `Customer with account number ${accountNumber} already exists (${existingName}).`;
}

export function updateAccountNumberConflictMessage(
  accountNumber: string,
  existingName: string
): string {
  return `Account number ${accountNumber} is already taken by ${existingName}.`;
}

/** Canonical name normalization — identical to the stored normalizedName. */
export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase();
}

export type NameAvailability =
  | { ok: true }
  | { ok: false; inactive: boolean; existingName: string };

/** Classify whether creating a client is blocked by an existing name, and if
    so whether that existing client is inactive (so the caller can give the
    exact Section-8 guidance instead of silently reactivating). */
export function checkNameAvailability(
  existing: Pick<CustomersRow, "name" | "isActive"> | null
): NameAvailability {
  if (!existing) return { ok: true };
  return { ok: false, inactive: !existing.isActive, existingName: existing.name };
}

/** Non-null error message when a duplicate name blocks creation. */
export function describeNameUnavailable(
  availability: NameAvailability
): string | null {
  if (availability.ok) return null;
  return availability.inactive
    ? `A client named ${availability.existingName} already exists but is inactive.`
    : `A client named ${availability.existingName} already exists.`;
}

/** Rename collision — renaming onto another existing client's normalized
    name is rejected regardless of that client's active state. Returns the
    colliding OTHER client (never self), or null. */
export function findRenameCollision(
  sameName: readonly CustomersRow[],
  selfId: string
): CustomersRow | null {
  return sameName.find((c) => c._id !== selfId) ?? null;
}

export function renameCollisionError(existingName: string): string {
  return `Cannot rename: a client named ${existingName} already exists.`;
}

/** Minimal DB surface needed for activate/deactivate (single mutation,
    soft toggle only). The real mutation passes Convex's ctx.db live; tests
    pass an in-memory fake. */
export type CustomersDb = {
  get: (id: string) => Promise<CustomersRow | null | undefined>;
  patch: (id: string, patch: { isActive: boolean }) => Promise<unknown>;
};

export async function toggleCustomerStatus(
  db: CustomersDb,
  id: string,
  isActive: boolean
): Promise<void> {
  const doc = await db.get(id);
  if (!doc) {
    throw new Error("Document not found");
  }
  await db.patch(id, { isActive });
}