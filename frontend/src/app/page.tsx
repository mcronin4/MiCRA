"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "@/components/auth/AuthModal";
import { Loader2 } from "lucide-react";
import { useState } from "react";

function HomeContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadWorkflowId = searchParams.get("loadWorkflow");

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Redirect authenticated users to dashboard (or workflow if loadWorkflow param)
  useEffect(() => {
    if (loading || !user) return;
    if (loadWorkflowId) {
      router.replace(`/workflow?loadWorkflow=${loadWorkflowId}`);
    } else {
      router.replace("/dashboard");
    }
  }, [user, loading, router, loadWorkflowId]);

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

  // Authenticated: show loading while redirect happens
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
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
