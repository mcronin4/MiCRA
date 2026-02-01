"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Node, Edge, ReactFlowInstance } from "@xyflow/react";
import { useWorkflowPersistence } from "@/hooks/useWorkflowPersistence";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import type { WorkflowMetadata } from "@/lib/fastapi/workflows";
import {
  listWorkflowVersions,
  getWorkflowVersion,
  type WorkflowVersionMetadata,
} from "@/lib/fastapi/workflows";
import {
  Trash2,
  X,
  Loader2,
  FileText,
  Sparkles,
  History,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkflowManagerProps {
  reactFlowNodes: Node[];
  reactFlowEdges: Edge[];
  reactFlowInstance: ReactFlowInstance | null;
  setNodes: (nodes: Node[] | ((nodes: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
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
  showSaveDialogExternal,
  showLoadDialogExternal,
  onDialogClose,
}: WorkflowManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [localWorkflowName, setLocalWorkflowName] = useState("");
  const [localWorkflowDescription, setLocalWorkflowDescription] = useState("");
  const [workflows, setWorkflows] = useState<WorkflowMetadata[]>([]);
  const [templates, setTemplates] = useState<WorkflowMetadata[]>([]);
  const [activeTab, setActiveTab] = useState<"mine" | "templates">("mine");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [versions, setVersions] = useState<WorkflowVersionMetadata[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  // Get workflow metadata from store
  const currentWorkflowId = useWorkflowStore((state) => state.currentWorkflowId);
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const workflowDescription = useWorkflowStore((state) => state.workflowDescription);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const setWorkflowDescription = useWorkflowStore((state) => state.setWorkflowDescription);
  const setWorkflowMetadata = useWorkflowStore((state) => state.setWorkflowMetadata);

  const {
    isLoading,
    error,
    saveWorkflow,
    loadWorkflow,
    fetchWorkflows,
    fetchTemplates,
    removeWorkflow,
  } = useWorkflowPersistence();
  const importWorkflowStructure = useWorkflowStore(
    (state) => state.importWorkflowStructure
  );

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
    setLocalWorkflowName("");
    setLocalWorkflowDescription("");
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
    const nameToSave = localWorkflowName.trim() || workflowName.trim();
    if (!nameToSave) {
      alert("Please enter a workflow name");
      return;
    }

    if (reactFlowNodes.length === 0) {
      alert("Cannot save empty workflow");
      return;
    }

    const result = await saveWorkflow(
      nameToSave,
      localWorkflowDescription.trim() || workflowDescription || undefined,
      reactFlowNodes,
      reactFlowEdges,
      currentWorkflowId,
    );

    if (result.success) {
      // Update store with saved workflow metadata
      setWorkflowMetadata(result.workflowId, nameToSave, localWorkflowDescription.trim() || workflowDescription || undefined);
      handleCloseSaveDialog();
      await loadWorkflows(); // Refresh list
      alert(currentWorkflowId ? "Workflow updated" : "Workflow saved");
    } else {
      alert(`Failed to save: ${result.error}`);
    }
  }, [
    localWorkflowName,
    localWorkflowDescription,
    workflowName,
    workflowDescription,
    reactFlowNodes,
    reactFlowEdges,
    currentWorkflowId,
    saveWorkflow,
    setWorkflowMetadata,
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
          // Update workflow metadata in store
          // Don't set currentWorkflowId for system workflows/templates
          // This allows users to modify and save as a new workflow
          setWorkflowMetadata(
            workflow.is_system ? undefined : workflow.id,
            result.workflowName || workflow.name,
            workflow.description || undefined,
          );
          handleCloseLoadDialog();
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
      setWorkflowMetadata,
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
        if (currentWorkflowId === workflowId) {
          // Clear workflow metadata if we deleted the current workflow
          setWorkflowMetadata(undefined, 'Untitled Workflow', undefined);
        }
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    },
    [removeWorkflow, currentWorkflowId, setWorkflowMetadata, loadWorkflows],
  );

  const handleShowVersionHistory = useCallback(
    async (workflowId: string) => {
      setSelectedWorkflowId(workflowId);
      setShowVersionHistory(true);
      setIsLoadingVersions(true);

      try {
        const versionList = await listWorkflowVersions(workflowId);
        setVersions(versionList);
      } catch (err) {
        alert(`Failed to load version history: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setShowVersionHistory(false);
      } finally {
        setIsLoadingVersions(false);
      }
    },
    []
  );

  const handleLoadVersion = useCallback(
    async (workflowId: string, versionNumber: number) => {
      if (
        !confirm(
          `Load version ${versionNumber}? Your current workflow will be replaced.`
        )
      ) {
        return;
      }

      try {
        const version = await getWorkflowVersion(workflowId, versionNumber);
        const { reactFlowNodes, reactFlowEdges } = importWorkflowStructure(
          version.workflow_data
        );

        setNodes(reactFlowNodes);
        setEdges(reactFlowEdges);
        setShowVersionHistory(false);
        handleCloseLoadDialog();

        // Fit view after loading
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.5, duration: 300 });
        }, 100);

        // Update workflow metadata in store
        const workflow = workflows.find((w) => w.id === workflowId);
        if (workflow) {
          setWorkflowMetadata(
            workflow.is_system ? undefined : workflowId,
            workflow.name,
            workflow.description || undefined,
          );
        }
      } catch (err) {
        alert(`Failed to load version: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [reactFlowInstance, setNodes, setEdges, setWorkflowMetadata, workflows, handleCloseLoadDialog, importWorkflowStructure]
  );

  // Pre-fill name when opening save dialog
  useEffect(() => {
    if (showSaveDialog) {
      // Use workflow name from store (which may have been edited in TopNavBar)
      if (workflowName) {
        setLocalWorkflowName(workflowName);
      } else if (currentWorkflowId) {
        const workflow = workflows.find((w) => w.id === currentWorkflowId);
        if (workflow) {
          setLocalWorkflowName(workflow.name);
          setLocalWorkflowDescription(workflow.description || "");
        }
      } else {
        setLocalWorkflowName("");
        setLocalWorkflowDescription("");
      }
    }
  }, [showSaveDialog, currentWorkflowId, workflowName, workflows]);

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
                  value={localWorkflowName}
                  onChange={(e) => setLocalWorkflowName(e.target.value)}
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
                  value={localWorkflowDescription}
                  onChange={(e) => setLocalWorkflowDescription(e.target.value)}
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
                  disabled={isLoading || (!localWorkflowName.trim() && !workflowName.trim())}
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
                            <>
                              <Button
                                onClick={() => handleShowVersionHistory(workflow.id)}
                                variant="outline"
                                size="sm"
                                disabled={isLoading}
                                title="View version history"
                              >
                                <History size={16} />
                              </Button>
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
                            </>
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

      {/* Version History Modal */}
      {showVersionHistory && selectedWorkflowId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Version History</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowVersionHistory(false);
                  setSelectedWorkflowId(null);
                  setVersions([]);
                }}
              >
                <X size={20} />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoadingVersions ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                  Loading versions...
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No versions found
                </div>
              ) : (
                <div className="space-y-2">
                  {versions.map((version, index) => {
                    const isLatest = index === 0;
                    const date = new Date(version.created_at);
                    const formattedDate = date.toLocaleString();

                    return (
                      <div
                        key={version.version_number}
                        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                          isLatest
                            ? "bg-blue-50 border-blue-200"
                            : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Version {version.version_number}
                            </span>
                            {isLatest && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                Latest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                            <Clock size={14} />
                            <span>{formattedDate}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {version.node_count} nodes • {version.edge_count}{" "}
                            connections
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button
                            onClick={() =>
                              handleLoadVersion(
                                selectedWorkflowId,
                                version.version_number
                              )
                            }
                            disabled={isLoading}
                            size="sm"
                            variant={isLatest ? "default" : "outline"}
                          >
                            {isLatest ? "Load" : "Restore"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
