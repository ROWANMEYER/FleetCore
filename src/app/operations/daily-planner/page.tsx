"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DailyPlannerIndexPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations/daily-planner/input"); }, [router]);
  return null;
}
