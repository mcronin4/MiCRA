"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Sparkles,
  Copy,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";
import {
  getWorkflow,
  createWorkflow,
  type WorkflowMetadata,
  type CreateWorkflowRequest,
} from "@/lib/fastapi/workflows";

interface CreateWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateBlank: () => void;
  onWorkflowCreated: (workflowId: string) => void;
}

type ModalView = "options" | "templates" | "fork";

export function CreateWorkflowModal({
  isOpen,
  onClose,
  onCreateBlank,
  onWorkflowCreated,
}: CreateWorkflowModalProps) {
  const [view, setView] = useState<ModalView>("options");
  const [templates, setTemplates] = useState<WorkflowMetadata[]>([]);
  const [userWorkflows, setUserWorkflows] = useState<WorkflowMetadata[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const { fetchTemplates, fetchWorkflows, isLoading } =
    useWorkflowPersistence();

  // Reset view when modal opens
  useEffect(() => {
    if (isOpen) setView("options");
  }, [isOpen]);

  const loadTemplates = useCallback(async () => {
    const result = await fetchTemplates();
    if (result.success) setTemplates(result.templates || []);
  }, [fetchTemplates]);

  const loadUserWorkflows = useCallback(async () => {
    const result = await fetchWorkflows();
    if (result.success) setUserWorkflows(result.workflows || []);
  }, [fetchWorkflows]);

  useEffect(() => {
    if (view === "templates") loadTemplates();
    if (view === "fork") loadUserWorkflows();
  }, [view, loadTemplates, loadUserWorkflows]);

  const handleCreateFromTemplate = async (template: WorkflowMetadata) => {
    setIsCreating(true);
    try {
      const fullWorkflow = await getWorkflow(template.id);
      const request: CreateWorkflowRequest = {
        name: `${template.name} (copy)`,
        description: template.description || undefined,
        workflow_data: fullWorkflow.workflow_data,
        is_system: false,
      };
      const created = await createWorkflow(request);
      onWorkflowCreated(created.id);
    } catch (err) {
      alert(
        `Failed to create from template: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleForkWorkflow = async (workflow: WorkflowMetadata) => {
    setIsCreating(true);
    try {
      const fullWorkflow = await getWorkflow(workflow.id);
      const request: CreateWorkflowRequest = {
        name: `${workflow.name} (copy)`,
        description: workflow.description || undefined,
        workflow_data: fullWorkflow.workflow_data,
        is_system: false,
      };
      const created = await createWorkflow(request);
      onWorkflowCreated(created.id);
    } catch (err) {
      alert(
        `Failed to duplicate workflow: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Workflow">
      {/* Options view */}
      {view === "options" && (
        <div className="space-y-3">
          <button
            onClick={onCreateBlank}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 transition-all text-left"
          >
            <div className="p-2.5 bg-indigo-50 rounded-lg shrink-0">
              <FileText size={20} className="text-indigo-600" />
            </div>
            <div>
              <div className="font-medium text-slate-800">Blank Workflow</div>
              <div className="text-sm text-slate-500">
                Start with an empty canvas
              </div>
            </div>
          </button>

          <button
            onClick={() => setView("templates")}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all text-left"
          >
            <div className="p-2.5 bg-emerald-50 rounded-lg shrink-0">
              <Sparkles size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="font-medium text-slate-800">From Template</div>
              <div className="text-sm text-slate-500">
                Start from a pre-built workflow
              </div>
            </div>
          </button>

          <button
            onClick={() => setView("fork")}
            className="w-full flex items-center gap-4 p-4 rounded-lg border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left"
          >
            <div className="p-2.5 bg-violet-50 rounded-lg shrink-0">
              <Copy size={20} className="text-violet-600" />
            </div>
            <div>
              <div className="font-medium text-slate-800">
                Duplicate Existing
              </div>
              <div className="text-sm text-slate-500">
                Copy one of your workflows
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Templates list */}
      {view === "templates" && (
        <div>
          <button
            onClick={() => setView("options")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          {isLoading ? (
            <div className="text-center py-10">
              <Loader2
                size={20}
                className="animate-spin mx-auto text-emerald-500"
              />
              <p className="text-sm text-slate-400 mt-2">
                Loading templates...
              </p>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              No templates available
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleCreateFromTemplate(t)}
                  disabled={isCreating}
                  className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-800 truncate">
                      {t.name}
                    </div>
                    {t.description && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {t.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-1">
                      {t.node_count} nodes
                    </div>
                  </div>
                  {isCreating && (
                    <Loader2
                      size={14}
                      className="animate-spin text-emerald-500 ml-3 shrink-0"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fork list */}
      {view === "fork" && (
        <div>
          <button
            onClick={() => setView("options")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          {isLoading ? (
            <div className="text-center py-10">
              <Loader2
                size={20}
                className="animate-spin mx-auto text-violet-500"
              />
              <p className="text-sm text-slate-400 mt-2">
                Loading workflows...
              </p>
            </div>
          ) : userWorkflows.length === 0 ? (
            <p className="text-center py-10 text-sm text-slate-500">
              No workflows to duplicate
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {userWorkflows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleForkWorkflow(w)}
                  disabled={isCreating}
                  className="w-full flex items-center justify-between p-3.5 rounded-lg border border-slate-200 hover:border-violet-300 hover:bg-violet-50/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-slate-800 truncate">
                      {w.name}
                    </div>
                    {w.description && (
                      <div className="text-xs text-slate-500 truncate mt-0.5">
                        {w.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-400 mt-1">
                      {w.node_count} nodes, {w.edge_count} edges
                    </div>
                  </div>
                  {isCreating && (
                    <Loader2
                      size={14}
                      className="animate-spin text-violet-500 ml-3 shrink-0"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
