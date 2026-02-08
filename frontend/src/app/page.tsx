"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import FinalReview from "@/components/FinalReview";
import AuthModal from "@/components/auth/AuthModal";
import { Loader2 } from "lucide-react";

function HomeContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();
  const loadWorkflowId = searchParams.get("loadWorkflow");

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [autoLoadId, setAutoLoadId] = useState<string | null>(loadWorkflowId);

  // Sync autoLoadId when searchParams change
  useEffect(() => {
    setAutoLoadId(loadWorkflowId);
  }, [loadWorkflowId]);


  const handleAutoLoadComplete = useCallback(() => {
    setAutoLoadId(null);
  }, []);

  // Loading state while auth resolves
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  // Unauthenticated: show login prompt
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight mb-2">
            MiCRA
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Multi-modal Intelligent Content Repurposing Agent
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Log in to get started
          </button>
        </div>

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          initialView="login"
        />
      </div>
    );
  }

  // Authenticated with loadWorkflow param: show editor with auto-load
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

  // Authenticated without loadWorkflow: blank editor
  return (
    <main>
      <FinalReview />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
