"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReactFlowWrapper } from "./canvas/ReactFlowWrapper";
import { ChatPanel } from "./final-review/ChatPanel";
import { CanvasPanel } from "./final-review/CanvasPanel";
import { NodeSidebar } from "./workflow/NodeSidebar";
import { TopNavBar } from "./workflow/TopNavBar";
import { ExecutionBar } from "./workflow/ExecutionBar";
import { CompilationDiagnosticsModal } from "./workflow/CompilationDiagnosticsModal";
import { showToast } from "@/lib/stores/toastStore";
import { useSourceTexts } from "@/hooks/useSourceTexts";
import { useTranscription } from "@/hooks/useTranscription";
import { useChatConversation } from "@/hooks/useChatConversation";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { useContextMenus } from "@/hooks/useContextMenus";
import { useWorkflowExecution } from "@/hooks/useWorkflowExecution";
import { useBlueprintCompile } from "@/hooks/useBlueprintCompile";
import { useWorkflowStore, getParamKeysToPersist } from "@/lib/stores/workflowStore";
import type {
  OutputNodeType,
  WorkflowNodeType,
  BucketNodeType,
  FlowNodeType,
  NodeType,
} from "./final-review/types";
import { WORKFLOW_NODES, FLOW_NODES, BUCKET_NODES } from "./final-review/types";

interface FinalReviewProps {
  autoLoadWorkflowId?: string | null;
  onAutoLoadComplete?: () => void;
}

const FinalReview = ({ autoLoadWorkflowId, onAutoLoadComplete }: FinalReviewProps = {}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">(
    "select",
  );
  // Dialog control for WorkflowManager
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  // Simple undo/redo state (placeholder - would need proper history management)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [undoStack, setUndoStack] = useState<unknown[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [redoStack, setRedoStack] = useState<unknown[]>([]);
  // Modals and notifications
  const [showCompilationModal, setShowCompilationModal] = useState(false);

  const router = useRouter();

  // Custom hooks for state management
  const sourceTextsHook = useSourceTexts();
  useTranscription(sourceTextsHook.addSourceFromTranscription);
  const canvasOps = useCanvasOperations();
  const contextMenus = useContextMenus();
  const { execute, isExecuting, executionResult, error: executionError } = useWorkflowExecution();
  const { compileRaw, diagnostics, errors: compilationErrors } = useBlueprintCompile();
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId);
  const chatHook = useChatConversation({
    sourceTexts: sourceTextsHook.sourceTexts,
    onAddNodeToCanvas: (
      nodeType: string,
      content?: string | Record<string, unknown>,
    ) => {
      canvasOps.addNodeToCanvas(
        nodeType as OutputNodeType | WorkflowNodeType,
        content,
      );
    },
  });

  const handleAddPart = (partType: NodeType) => {
    // Check if it's a workflow node, bucket node, or flow node - if so, just add it directly to canvas
    if (
      WORKFLOW_NODES.includes(partType as WorkflowNodeType) ||
      BUCKET_NODES.includes(partType as BucketNodeType) ||
      FLOW_NODES.includes(partType as FlowNodeType)
    ) {
      canvasOps.addNodeToCanvas(partType as WorkflowNodeType | BucketNodeType);
      contextMenus.setMenuPosition(null);
      return;
    }

    // For output nodes, trigger chat-based generation
    contextMenus.setMenuPosition(null);

    // Ensure chat is visible
    if (!isChatOpen) {
      setIsChatOpen(true);
    }

    // Map part type to content type string
    const contentTypeMap: Record<OutputNodeType, string> = {
      LinkedIn: "linkedin",
      TikTok: "tiktok",
      Email: "email",
    };
    const contentType = contentTypeMap[partType as OutputNodeType];

    // Check if we have source text
    const hasSource = sourceTextsHook.sourceTexts.length > 0;

    if (hasSource) {
      const botMessage = {
        user: "MICRAi",
        text: `I'll create a ${partType} ${contentType === "linkedin" ? "post" : contentType === "email" ? "draft" : "script"} using your source material. What tone or style would you like?`,
        showToneOptions: true,
      };
      chatHook.setChatHistory(
        (
          prev: Array<{
            user: string;
            text: string;
            showToneOptions?: boolean;
          }>,
        ) => [...prev, botMessage],
      );

      chatHook.setConversationState({
        waiting_for_tone: true,
        content_type: contentType,
        user_instruction: "Create content from source material",
        from_canvas: true,
      });
    } else {
      const contentName =
        contentType === "linkedin"
          ? "LinkedIn post"
          : contentType === "email"
            ? "email"
            : "TikTok script";
      const botMessage = {
        user: "MICRAi",
        text: `I'll help you create a ${contentName}! What topic or message would you like to ${contentType === "email" ? "communicate" : "share"}?`,
      };
      chatHook.setChatHistory(
        (
          prev: Array<{
            user: string;
            text: string;
            showToneOptions?: boolean;
          }>,
        ) => [...prev, botMessage],
      );

      chatHook.setConversationState({
        waiting_for_context: true,
        content_type: contentType,
        from_canvas: true,
      });
    }
  };

  const handleAddNodeFromSidebar = (nodeType: NodeType) => {
    handleAddPart(nodeType);
  };

  /**
   * Prepares workflow data for execution by syncing runtime params from the Zustand store.
   * This ensures params like selected_file_ids, preset_id, and aspect_ratio are available to the backend.
   */
  const prepareWorkflowForExecution = () => {
    if (!canvasOps.reactFlowInstance) return null;

    const nodes = canvasOps.reactFlowInstance.getNodes();
    const edges = canvasOps.reactFlowInstance.getEdges();

    if (nodes.length === 0) return null;

    // Use the store's exportWorkflowForExecution which handles bucket nodes
    const { exportWorkflowForExecution, nodes: storeNodes } = useWorkflowStore.getState();
    const workflowData = exportWorkflowForExecution(nodes, edges);

    // Sync all non-connected params from store (preset_id, aspect_ratio, style, count, etc.)
    workflowData.nodes = workflowData.nodes.map((node) => {
      const storeNode = storeNodes[node.id];
      if (!storeNode) return node;

      const paramKeys = getParamKeysToPersist(storeNode.type, storeNode.inputs);
      const params: Record<string, unknown> = {};
      for (const key of paramKeys) {
        const value = storeNode.inputs[key];
        if (value !== undefined) params[key] = value;
      }

      if (Object.keys(params).length > 0) {
        return { ...node, data: { ...node.data, ...params } };
      }
      return node;
    });

    return workflowData;
  };

  /**
   * Validates that all bucket nodes have at least one file selected.
   * Returns an error message if validation fails, or null if valid.
   */
  const validateBucketNodes = (workflowData: ReturnType<typeof prepareWorkflowForExecution>): string | null => {
    if (!workflowData) return null;

    const bucketNodeTypes = ['ImageBucket', 'AudioBucket', 'VideoBucket', 'TextBucket'];
    const bucketTypeNames: Record<string, string> = {
      'ImageBucket': 'Image',
      'AudioBucket': 'Audio',
      'VideoBucket': 'Video',
      'TextBucket': 'Text',
    };

    for (const node of workflowData.nodes) {
      if (bucketNodeTypes.includes(node.type)) {
        const selectedFileIds = node.data?.selected_file_ids;
        if (!selectedFileIds || !Array.isArray(selectedFileIds) || selectedFileIds.length === 0) {
          const bucketName = bucketTypeNames[node.type] || 'Media';
          return `${bucketName} Bucket is empty. Please select at least one file.`;
        }
      }
    }

    return null;
  };

  const handleExecuteWorkflow = async () => {
    // Check if workflow is saved first
    const { currentWorkflowId } = useWorkflowStore.getState();
    if (!currentWorkflowId) {
      showToast("Please save the workflow before executing", "warning");
      setShowSaveDialog(true);
      return;
    }

    const workflowData = prepareWorkflowForExecution();

    if (!workflowData) {
      if (!canvasOps.reactFlowInstance) {
        showToast("ReactFlow instance not available", "error");
      } else {
        showToast("No nodes to execute", "warning");
      }
      return;
    }

    // Validate bucket nodes have files selected (user-friendly check before compilation)
    const bucketValidationError = validateBucketNodes(workflowData);
    if (bucketValidationError) {
      showToast(bucketValidationError, "error");
      return;
    }

    // First, compile to check for errors
    const compilationResult = await compileRaw(workflowData);

    if (!compilationResult || !compilationResult.success) {
      setShowCompilationModal(true);
      return;
    }

    // If there are warnings but no errors, show diagnostics but allow proceeding
    if (diagnostics.length > 0 && compilationErrors.length === 0) {
      setShowCompilationModal(true);
      return;
    }

    // Proceed with execution
    try {
      const { currentWorkflowId, workflowName } = useWorkflowStore.getState();
      const result = await execute(workflowData, currentWorkflowId || undefined, workflowName || undefined);
      const viewResultsAction =
        currentWorkflowId
          ? { label: "View results", onClick: () => router.push(`/preview/${currentWorkflowId}`) }
          : undefined;
      if (result) {
        showToast(
          result.success
            ? "Workflow executed successfully"
            : "Workflow execution completed with errors",
          result.success ? "success" : "warning",
          viewResultsAction
        );
      } else {
        showToast(
          "Workflow execution completed but no result returned",
          "warning",
          viewResultsAction
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Workflow execution failed";
      showToast(errorMessage, "error");
    }
  };

  const handleProceedWithExecution = async () => {
    // Double-check workflow is saved (should already be checked in handleExecuteWorkflow)
    const { currentWorkflowId } = useWorkflowStore.getState();
    if (!currentWorkflowId) {
      showToast("Please save the workflow before executing", "warning");
      setShowCompilationModal(false);
      setShowSaveDialog(true);
      return;
    }

    const workflowData = prepareWorkflowForExecution();

    if (!workflowData) return;

    // Validate bucket nodes have files selected
    const bucketValidationError = validateBucketNodes(workflowData);
    if (bucketValidationError) {
      showToast(bucketValidationError, "error");
      setShowCompilationModal(false);
      return;
    }

    setShowCompilationModal(false);

    try {
      const { currentWorkflowId } = useWorkflowStore.getState();
      const result = await execute(workflowData);
      const viewResultsAction =
        currentWorkflowId
          ? { label: "View results", onClick: () => router.push(`/preview/${currentWorkflowId}`) }
          : undefined;
      if (result) {
        showToast(
          result.success
            ? "Workflow executed successfully"
            : "Workflow execution completed with errors",
          result.success ? "success" : "warning",
          viewResultsAction
        );
      } else {
        showToast(
          "Workflow execution completed but no result returned",
          "warning",
          viewResultsAction
        );
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Workflow execution failed";
      showToast(errorMessage, "error");
    }
  };

  // Show toast for execution errors
  useEffect(() => {
    if (executionError) {
      showToast(executionError, "error");
    }
  }, [executionError]);

  const handleUndo = () => {
    console.log("Undo action");
    // TODO: Implement proper undo logic
  };

  const handleRedo = () => {
    console.log("Redo action");
    // TODO: Implement proper redo logic
  };

  return (
    <div className="h-screen flex flex-col font-sans text-[#1d1d1f] overflow-hidden bg-white">
      {/* Top Navigation Bar */}
      <TopNavBar
        onSave={() => setShowSaveDialog(true)}
        canSave={true}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <NodeSidebar onAddNode={handleAddNodeFromSidebar} />

        {/* Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ReactFlowWrapper>
            {(flowProps) => (
              <CanvasPanel
                {...flowProps}
                isChatOpen={isChatOpen}
                setIsChatOpen={setIsChatOpen}
                menuPosition={contextMenus.menuPosition}
                setMenuPosition={contextMenus.setMenuPosition}
                partContextMenu={contextMenus.partContextMenu}
                setPartContextMenu={contextMenus.setPartContextMenu}
                canvasContainerRef={contextMenus.canvasContainerRef}
                handleCanvasContextMenu={contextMenus.handleCanvasContextMenu}
                handlePartContextMenu={contextMenus.handlePartContextMenu}
                handleAddPart={handleAddPart}
                handleDeletePart={canvasOps.handleDeletePart}
                handleDuplicatePart={canvasOps.handleDuplicatePart}
                handleCopyContent={canvasOps.handleCopyContent}
                reactFlowInstance={canvasOps.reactFlowInstance}
                setReactFlowInstance={canvasOps.setReactFlowInstance}
                isLocked={canvasOps.isLocked}
                setIsLocked={canvasOps.setIsLocked}
                setNodesRef={canvasOps.setNodesRef}
                showSaveDialog={showSaveDialog}
                showLoadDialog={showLoadDialog}
                onDialogClose={() => {
                  setShowSaveDialog(false);
                  setShowLoadDialog(false);
                }}
                interactionMode={interactionMode}
                autoLoadWorkflowId={autoLoadWorkflowId}
                onAutoLoadComplete={onAutoLoadComplete}
              />
            )}
          </ReactFlowWrapper>

          {/* Bottom Execution Bar */}
          <ExecutionBar
            reactFlowInstance={canvasOps.reactFlowInstance}
            onChatToggle={() => setIsChatOpen(!isChatOpen)}
            isChatOpen={isChatOpen}
            onExecuteWorkflow={handleExecuteWorkflow}
            interactionMode={interactionMode}
            onInteractionModeChange={setInteractionMode}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            isExecuting={isExecuting}
            executionJustCompleted={!!executionResult && !isExecuting}
            currentWorkflowId={currentWorkflowId}
            onViewResults={() => {
              if (currentWorkflowId) router.push(`/preview/${currentWorkflowId}`);
            }}
          />
        </div>
      </div>

      {/* Chat Panel Overlay */}
      {isChatOpen && (
        <ChatPanel
          chatMessage={chatHook.chatMessage}
          setChatMessage={chatHook.setChatMessage}
          chatHistory={chatHook.chatHistory}
          chatHistoryRef={chatHook.chatHistoryRef}
          textareaRef={chatHook.textareaRef}
          handleSendMessage={chatHook.handleSendMessage}
          handleToneSelect={chatHook.handleToneSelect}
        />
      )}

      {/* Compilation Diagnostics Modal */}
      <CompilationDiagnosticsModal
        isOpen={showCompilationModal}
        onClose={() => setShowCompilationModal(false)}
        diagnostics={diagnostics}
        onProceed={handleProceedWithExecution}
      />
    </div>
  );
};

export default FinalReview;
