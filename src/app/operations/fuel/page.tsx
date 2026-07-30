"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function FuelRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations"); }, [router]);
  return null;
}
FuelRedirect.displayName = "FuelRedirect";
export default FuelRedirect;
