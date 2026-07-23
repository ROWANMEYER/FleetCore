"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OperationsPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations/daily-planner/input"); }, [router]);
  return null;
}
