"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FuelRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/operations"); }, [router]);
  return null;
}
