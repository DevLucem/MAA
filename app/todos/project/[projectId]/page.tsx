import { Suspense } from "react";
import { TodosProjectView } from "@/app/components/todos/TodosProjectView";

export default function TodosProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted sm:px-8">
          Loading project…
        </div>
      }
    >
      <TodosProjectView />
    </Suspense>
  );
}
