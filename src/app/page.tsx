"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/components/auth/AuthProvider";

function HomeRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    router.replace(mobile ? "/start" : user ? "/dashboard" : "/login");
  }, [loading, router, user]);
  return null;
}
HomeRedirectPage.displayName = "HomeRedirect";
export default HomeRedirectPage;
