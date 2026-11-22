import { Suspense } from "react";
import { TodosInboxView } from "@/app/components/todos/TodosInboxView";

export default function TodosInboxPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-muted sm:px-8">
          Loading Inbox…
        </div>
      }
    >
      <TodosInboxView />
    </Suspense>
  );
}
