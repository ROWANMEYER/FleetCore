"use client";

import EditRouteForm from "@/src/components/operations/daily-planner/EditRouteForm";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

export default function EditRoutePage() {
  const router = useRouter();
  const params = useParams();
  const routeId = params.routeId as Id<"dailyRoutes">;

  const handleSuccess = () => {
    router.push("/operations/daily-planner/sheets");
  };

  const handleCancel = () => {
    router.push("/operations/daily-planner/sheets");
  };

  return (
    <div className="h-full w-full overflow-y-auto" style={{backgroundColor:"var(--background)"}}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold tracking-tight mb-4" style={{color:"var(--foreground)"}}>
          Edit Route
        </h1>
        <EditRouteForm 
          routeId={routeId}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
}
