import { Suspense } from "react";
import { FinanceAccountView } from "@/app/components/FinanceAccountView";

export default function FinanceAccountPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-8 lg:px-12">
          Loading account…
        </div>
      }
    >
      <FinanceAccountView />
    </Suspense>
  );
}
