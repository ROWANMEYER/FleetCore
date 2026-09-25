/* Pure client-list search + status filtering for the Clients Management page.
   Intra-page only — deliberately independent from Quick Capture resolution
   (dispatch matching) and from the backend customers.search query (which
   remains name + account number for inline pickers). Keep it exactly the
   substring-based, case-insensitive behaviour below; no fuzzy matching. */

export type ClientRow = {
  name: string;
  accountNumber?: string;
  vatNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
};

export type ClientStatusFilter = "all" | "active" | "inactive";

export function filterClients<T extends ClientRow>(
  clients: readonly T[],
  search: string,
  status: ClientStatusFilter
): T[] {
  const q = search.trim().toLowerCase();
  return clients.filter((c) => {
    if (status === "active" && !c.isActive) return false;
    if (status === "inactive" && c.isActive) return false;
    if (!q) return true;

    const haystack = [
      c.name,
      c.accountNumber,
      c.vatNumber,
      c.contactPerson,
      c.phone,
      c.email,
    ];
    return haystack.some((value) => (value ?? "").toLowerCase().includes(q));
  });
}