import { Suspense } from "react";
import { DocEditor } from "@/app/components/DocEditor";

export default function DocPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl text-sm text-muted">
          Loading document…
        </div>
      }
    >
      <DocEditor />
    </Suspense>
  );
}
