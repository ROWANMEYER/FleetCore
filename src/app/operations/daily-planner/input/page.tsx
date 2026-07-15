"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { Suspense } from "react";
import DailyPlannerInputContent from "./DailyPlannerInputContent";

export default function DailyPlannerInputPage() {
  return (
    <Suspense fallback={null}>
      <DailyPlannerInputContent />
    </Suspense>
  );
}
