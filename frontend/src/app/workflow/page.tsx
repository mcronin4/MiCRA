"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import FinalReview from "@/components/FinalReview";
import { Loader2 } from "lucide-react";

function WorkflowContent() {
  const searchParams = useSearchParams();
  const loadWorkflowId = searchParams.get("loadWorkflow");
  const [autoLoadId, setAutoLoadId] = useState<string | null>(loadWorkflowId);

  useEffect(() => {
    setAutoLoadId(loadWorkflowId);
  }, [loadWorkflowId]);

  const handleAutoLoadComplete = useCallback(() => {
    setAutoLoadId(null);
  }, []);

  if (loadWorkflowId) {
    return (
      <main>
        <FinalReview
          autoLoadWorkflowId={autoLoadId}
          onAutoLoadComplete={handleAutoLoadComplete}
        />
      </main>
    );
  }

  return (
    <main>
      <FinalReview />
    </main>
  );
}

export default function WorkflowPage() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        }
      >
        <WorkflowContent />
      </Suspense>
    </ProtectedRoute>
  );
}
