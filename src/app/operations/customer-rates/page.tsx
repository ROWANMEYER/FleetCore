"use client";
import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { CustomerSheets } from "@/src/components/customer-rates/CustomerSheets";

export default function CustomerRatesPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState<Id<"customers"> | null>(null);
  if (user?.role !== "admin") return <p className="p-6">Admin access is required to manage customer rates.</p>;
  return <main className="h-full overflow-auto p-6 space-y-6">
    <header>
      <h1 className="text-2xl font-semibold">Customer Rates</h1>
      <p className="text-[var(--nav-text-color)]">Open a customer to edit their lanes and rates. Changes go live when you save.</p>
    </header>
    <CustomerSheets open={open} onOpen={setOpen} />
  </main>;
}
