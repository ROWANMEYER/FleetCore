"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function DailyPlannerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations/daily-planner/sheets"); }, [router]);
  return null;
}
DailyPlannerRedirect.displayName = "DailyPlannerRedirect";
export default DailyPlannerRedirect;
