"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function HomeRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard"); }, [router]);
  return null;
}
HomeRedirectPage.displayName = "HomeRedirect";
export default HomeRedirectPage;
