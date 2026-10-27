"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { isMobileAppEnvironment } from "@/src/lib/appMode";

function HomeRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const mobile = isMobileAppEnvironment();
    router.replace(mobile ? "/start" : user ? "/dashboard" : "/login");
  }, [loading, router, user]);
  return null;
}
HomeRedirectPage.displayName = "HomeRedirect";
export default HomeRedirectPage;
