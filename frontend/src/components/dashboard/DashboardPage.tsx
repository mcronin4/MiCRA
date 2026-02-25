"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ChevronDown,
  LogOut,
  Loader2,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  getWorkflow,
  createWorkflow,
  type WorkflowMetadata,
  type CreateWorkflowRequest,
} from "@/lib/fastapi/workflows";
import { WorkflowRow } from "./WorkflowRow";
import { CreateWorkflowModal } from "./CreateWorkflowModal";
import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/stores/toastStore";
import type { User } from "@supabase/supabase-js";

type SortOption = "updated" | "created" | "name";

/** Extract display name from Supabase user metadata. */
function displayNameFromUser(user: User | null): string {
  if (!user?.user_metadata) return user?.email || "User";
  const m = user.user_metadata as Record<string, unknown>;
  const s = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return (
    s(m.full_name) ??
    s(m.name) ??
    s(m.display_name) ??
    s(m.user_name) ??
    s(m.username) ??
    user.email ??
    "User"
  );
}

export function DashboardPage() {
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const router = useRouter();
  const { user, signOut } = useAuth();
  const { fetchWorkflows, removeWorkflow, isLoading, error } =
    useWorkflowPersistence();
  const clearWorkflowMetadata = useWorkflowStore(
    (state) => state.clearWorkflowMetadata
  );
  const setWorkflowMetadata = useWorkflowStore(
    (state) => state.setWorkflowMetadata
  );

  // Fetch workflows on mount
  const loadDashboardData = useCallback(async () => {
    const result = await fetchWorkflows();
    if (result.success) {
      setWorkflows(result.workflows || []);
    }
  }, [fetchWorkflows]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Filter and sort workflows
  const filteredWorkflows = useMemo(() => {
    let list = workflows;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description && w.description.toLowerCase().includes(q))
      );
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case "updated":
        sorted.sort(
          (a, b) =>
            new Date(b.updated_at).getTime() -
            new Date(a.updated_at).getTime()
        );
        break;
      case "created":
        sorted.sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        );
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return sorted;
  }, [workflows, searchQuery, sortBy]);

  const handleOpenWorkflow = (workflow: WorkflowMetadata) => {
    // Set loading state to show spinner on clicked card
    setLoadingId(workflow.id);

    // Clear old workflow data from store BEFORE navigation
    // This prevents flash of old workflow when canvas mounts
    clearWorkflowMetadata();

    // Set new workflow metadata (will be used after load completes)
    setWorkflowMetadata(
      workflow.id,
      workflow.name,
      workflow.description || undefined
    );

    router.push(`/workflow?loadWorkflow=${workflow.id}`);
  };

  const handleDeleteWorkflow = async (
    workflowId: string,
    workflowName: string
  ) => {
    if (!confirm(`Delete workflow "${workflowName}"? This cannot be undone.`))
      return;
    setDeletingId(workflowId);
    const result = await removeWorkflow(workflowId);
    if (result.success) {
      setWorkflows((prev) => prev.filter((w) => w.id !== workflowId));
    } else {
      showToast(`Failed to delete: ${result.error}`, "error");
    }
    setDeletingId(null);
  };

  const handleDuplicateWorkflow = async (workflow: WorkflowMetadata) => {
    try {
      const fullWorkflow = await getWorkflow(workflow.id);
      const request: CreateWorkflowRequest = {
        name: `${workflow.name} (copy)`,
        description: workflow.description || undefined,
        workflow_data: fullWorkflow.workflow_data,
        is_system: false,
      };
      await createWorkflow(request);
      await loadDashboardData();
    } catch (err) {
      showToast(
        `Failed to duplicate: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
    }
  };

  const handleCreateBlank = () => {
    clearWorkflowMetadata();
    setShowCreateModal(false);
    router.push("/workflow");
  };

  const handleWorkflowCreated = (workflowId: string) => {
    setShowCreateModal(false);
    router.push(`/workflow?loadWorkflow=${workflowId}`);
  };

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const displayName = displayNameFromUser(user);
  const displayChar = (
    user?.user_metadata?.username?.[0] ||
    user?.user_metadata?.full_name?.[0] ||
    user?.email?.[0] ||
    "?"
  ).toUpperCase();

  const sortLabels: Record<SortOption, string> = {
    updated: "Last updated",
    created: "Date created",
    name: "Name",
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-semibold text-slate-800 tracking-tight">
              MiCRA
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold"
                title={user?.email || ""}
              >
                {displayChar}
              </div>
              <span className="text-sm text-slate-600 hidden sm:block">
                {displayName}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Title row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              {displayName}&apos;s Workflows
            </h1>
            {workflows.length > 0 && (
              <p className="text-sm text-slate-400 mt-0.5">
                {workflows.length} workflow
                {workflows.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus size={16} className="mr-1.5" />
            Create Workflow
          </Button>
        </div>

        {/* Search + Sort toolbar */}
        {workflows.length > 0 && (
          <div className="flex items-center justify-between mb-5 gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
              />
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg bg-white hover:bg-slate-50 transition-colors"
              >
                Sort by: {sortLabels[sortBy]}
                <ChevronDown size={14} className="text-slate-400" />
              </button>
              {showSortMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowSortMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20">
                    {(
                      Object.entries(sortLabels) as [SortOption, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setSortBy(key);
                          setShowSortMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          sortBy === key
                            ? "text-indigo-600 bg-indigo-50"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && workflows.length === 0 && (
          <div className="text-center py-20">
            <Loader2
              size={24}
              className="animate-spin mx-auto mb-3 text-indigo-500"
            />
            <p className="text-sm text-slate-500">Loading workflows...</p>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="text-center py-20">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={loadDashboardData}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && workflows.length === 0 && (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-100 rounded-xl mb-4">
              <Workflow size={24} className="text-slate-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700">
              No workflows yet
            </h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              Create your first workflow to get started
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus size={16} className="mr-1.5" />
              Create Workflow
            </Button>
          </div>
        )}

        {/* No search results */}
        {!isLoading &&
          workflows.length > 0 &&
          filteredWorkflows.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-slate-500">
                No workflows matching &quot;{searchQuery}&quot;
              </p>
            </div>
          )}

        {/* Workflow list */}
        {filteredWorkflows.length > 0 && (
          <div className="space-y-2">
            {filteredWorkflows.map((workflow) => (
              <WorkflowRow
                key={workflow.id}
                workflow={workflow}
                onOpen={() => handleOpenWorkflow(workflow)}
                onDuplicate={() => handleDuplicateWorkflow(workflow)}
                onDelete={() =>
                  handleDeleteWorkflow(workflow.id, workflow.name)
                }
                isDeleting={deletingId === workflow.id}
                isLoading={loadingId === workflow.id}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create Workflow Modal */}
      <CreateWorkflowModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateBlank={handleCreateBlank}
        onWorkflowCreated={handleWorkflowCreated}
      />
    </div>
  );
}
