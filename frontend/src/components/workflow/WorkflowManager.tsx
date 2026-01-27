"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";
import type { Workflow, WorkflowMetadata } from "@/lib/fastapi/workflows";
import {
  Trash2,
  X,
  Loader2,
  FileText,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkflowManagerProps {
  reactFlowNodes: Node[];
  reactFlowEdges: Edge[];
  reactFlowInstance: ReactFlowInstance | null;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  currentWorkflowId?: string;
  onWorkflowChanged?: (workflowId: string | undefined) => void;
  showSaveDialogExternal?: boolean;
  showLoadDialogExternal?: boolean;
  onDialogClose?: () => void;
}

export function WorkflowManager({
  reactFlowNodes,
  reactFlowEdges,
  reactFlowInstance,
  setNodes,
  setEdges,
  currentWorkflowId,
  onWorkflowChanged,
  showSaveDialogExternal,
  showLoadDialogExternal,
  onDialogClose,
}: WorkflowManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowDescription, setWorkflowDescription] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [templates, setTemplates] = useState<WorkflowMetadata[]>([]);
  const [activeTab, setActiveTab] = useState<"mine" | "templates">("mine");

  const {
    isLoading,
    error,
    saveWorkflow,
    loadWorkflow,
    fetchWorkflows,
    fetchTemplates,
    removeWorkflow,
  } = useWorkflowPersistence();

  // Handle external dialog triggers
  useEffect(() => {
    if (showSaveDialogExternal) {
      setShowSaveDialog(true);
    }
  }, [showSaveDialogExternal]);

  useEffect(() => {
    if (showLoadDialogExternal) {
      setIsOpen(true);
    }
  }, [showLoadDialogExternal]);

  // Notify parent when dialogs close
  const handleCloseSaveDialog = useCallback(() => {
    setShowSaveDialog(false);
    setWorkflowName("");
    setWorkflowDescription("");
    onDialogClose?.();
  }, [onDialogClose]);

  const handleCloseLoadDialog = useCallback(() => {
    setIsOpen(false);
    onDialogClose?.();
  }, [onDialogClose]);

  // Load workflows on mount when dialog opens
  const loadWorkflows = useCallback(async () => {
    const [workflowsResult, templatesResult] = await Promise.all([
      fetchWorkflows(), // User workflows (non-system)
      fetchTemplates(),
    ]);

    if (workflowsResult.success) {
      setWorkflows(workflowsResult.workflows || []);
    }
    if (templatesResult.success) {
      setTemplates(templatesResult.templates || []);
    }
  }, [fetchWorkflows, fetchTemplates]);

  useEffect(() => {
    if (isOpen) {
      loadWorkflows();
    }
  }, [isOpen, loadWorkflows]);

  const handleSave = useCallback(async () => {
    if (!workflowName.trim()) {
      alert("Please enter a workflow name");
      return;
    }

    if (reactFlowNodes.length === 0) {
      alert("Cannot save empty workflow");
      return;
    }

    const result = await saveWorkflow(
      workflowName.trim(),
      workflowDescription.trim() || undefined,
      reactFlowNodes,
      reactFlowEdges,
      currentWorkflowId,
    );

    if (result.success) {
      handleCloseSaveDialog();
      if (onWorkflowChanged && result.workflowId) {
        onWorkflowChanged(result.workflowId);
      }
      await loadWorkflows(); // Refresh list
      alert(currentWorkflowId ? "Workflow updated" : "Workflow saved");
    } else {
      alert(`Failed to save: ${result.error}`);
    }
  }, [
    workflowName,
    workflowDescription,
    reactFlowNodes,
    reactFlowEdges,
    currentWorkflowId,
    saveWorkflow,
    onWorkflowChanged,
    loadWorkflows,
    handleCloseSaveDialog,
  ]);

  const handleLoad = useCallback(
    async (workflow: WorkflowMetadata) => {
      if (
        confirm(
          `Load ${workflow.is_system ? "template" : "workflow"} "${workflow.name}"? Your current workflow will be replaced.`,
        )
      ) {
        const result = await loadWorkflow(workflow.id, reactFlowInstance);

        if (result.success && result.nodes && result.edges) {
          setNodes(result.nodes);
          setEdges(result.edges);
          handleCloseLoadDialog();
          if (onWorkflowChanged) {
            // Don't set currentWorkflowId for system workflows/templates
            // This allows users to modify and save as a new workflow
            onWorkflowChanged(
              workflow.is_system ? undefined : workflow.id,
            );
          }
        } else {
          alert(`Failed to load: ${result.error}`);
        }
      }
    },
    [
      loadWorkflow,
      reactFlowInstance,
      setNodes,
      setEdges,
      onWorkflowChanged,
      handleCloseLoadDialog,
    ],
  );

  const handleDelete = useCallback(
    async (workflowId: string, workflowName: string) => {
      if (
        !confirm(`Delete workflow "${workflowName}"? This cannot be undone.`)
      ) {
        return;
      }

      const result = await removeWorkflow(workflowId);

      if (result.success) {
        await loadWorkflows();
        if (currentWorkflowId === workflowId && onWorkflowChanged) {
          onWorkflowChanged(undefined);
        }
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    },
    [removeWorkflow, currentWorkflowId, onWorkflowChanged, loadWorkflows],
  );

  // Pre-fill name when opening save dialog if workflow already has a name
  useEffect(() => {
    if (showSaveDialog && currentWorkflowId) {
      const workflow = workflows.find((w) => w.id === currentWorkflowId);
      if (workflow) {
        setWorkflowName(workflow.name);
        setWorkflowDescription(workflow.description || "");
      }
    } else if (showSaveDialog && !currentWorkflowId) {
      setWorkflowName("");
      setWorkflowDescription("");
    }
  }, [showSaveDialog, currentWorkflowId, workflows]);

  return (
    <>
      {/* Save Dialog Modal */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h2 className="text-xl font-semibold mb-4">
              {currentWorkflowId ? "Update Workflow" : "Save Workflow"}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="My Workflow"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={workflowDescription}
                  onChange={(e) => setWorkflowDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                <strong>Note:</strong> Only workflow structure (nodes,
                connections, positions) is saved. Node inputs/outputs,
                attachments, and execution state are not persisted.
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSaveDialog(false);
                    setWorkflowName("");
                    setWorkflowDescription("");
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isLoading || !workflowName.trim()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Load Dialog Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Load Workflow</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
              >
                <X size={20} />
              </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b">
              <button
                onClick={() => setActiveTab("mine")}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === "mine"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <FileText size={16} className="inline mr-2" />
                My Workflows ({workflows.length})
              </button>
              <button
                onClick={() => setActiveTab("templates")}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === "templates"
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Sparkles size={16} className="inline mr-2" />
                Templates ({templates.length})
              </button>
            </div>

            {/* Workflow List */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && workflows.length === 0 && templates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  Loading...
                </div>
              ) : error ? (
                <div className="text-center py-8 text-red-500">{error}</div>
              ) : (
                <div className="space-y-2">
                  {(activeTab === "mine" ? workflows : templates).map(
                    (workflow) => (
                      <div
                        key={workflow.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {workflow.name}
                          </div>
                          {workflow.description && (
                            <div className="text-sm text-gray-500 truncate">
                              {workflow.description}
                            </div>
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {workflow.node_count} nodes •{" "}
                            {workflow.edge_count} connections
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            onClick={() => handleLoad(workflow)}
                            disabled={isLoading}
                            size="sm"
                          >
                            Load
                          </Button>
                          {!workflow.is_system && (
                            <Button
                              onClick={() =>
                                handleDelete(workflow.id, workflow.name)
                              }
                              variant="destructive"
                              size="sm"
                              disabled={isLoading}
                              title="Delete workflow"
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                  {(activeTab === "mine" ? workflows : templates).length ===
                    0 && (
                    <div className="text-center py-8 text-gray-500">
                      {activeTab === "mine"
                        ? "No saved workflows yet"
                        : "No templates available"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
