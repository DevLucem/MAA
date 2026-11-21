import { Suspense } from "react";
import { DatabasePageView } from "@/app/components/DatabasePageView";

export default function DatabasePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl text-sm text-muted">
          Loading database…
        </div>
      }
    >
      <DatabasePageView />
    </Suspense>
  );
}
