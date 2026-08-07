"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function OperationsRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations/daily-planner/sheets"); }, [router]);
  return null;
}
OperationsRedirectPage.displayName = "OperationsRedirect";
export default OperationsRedirectPage;
