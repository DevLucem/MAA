import { Suspense } from "react";
import { TodosTodayView } from "@/app/components/todos/TodosTodayView";

export default function TodosPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full px-4 py-6 text-sm text-muted sm:px-8 lg:px-10">
          Loading Todos…
        </div>
      }
    >
      <TodosTodayView />
    </Suspense>
  );
}
