"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function DailyPlannerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations/daily-planner/input"); }, [router]);
  return null;
}
DailyPlannerRedirect.displayName = "DailyPlannerRedirect";
export default DailyPlannerRedirect;
