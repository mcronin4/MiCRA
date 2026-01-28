"use client";
import React, { useState, useEffect } from "react";
import { ReactFlowWrapper } from "./canvas/ReactFlowWrapper";
import { ChatPanel } from "./final-review/ChatPanel";
import { CanvasPanel } from "./final-review/CanvasPanel";
import { NodeSidebar } from "./workflow/NodeSidebar";
import { TopNavBar } from "./workflow/TopNavBar";
import { ExecutionBar } from "./workflow/ExecutionBar";
import { ExecutionResultsModal } from "./workflow/ExecutionResultsModal";
import { CompilationDiagnosticsModal } from "./workflow/CompilationDiagnosticsModal";
import Toast from "./ui/Toast";
import { useSourceTexts } from "@/hooks/useSourceTexts";
import { useTranscription } from "@/hooks/useTranscription";
import { useChatConversation } from "@/hooks/useChatConversation";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { useContextMenus } from "@/hooks/useContextMenus";
import { useWorkflowExecution } from "@/hooks/useWorkflowExecution";
import { useBlueprintCompile } from "@/hooks/useBlueprintCompile";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import type { SavedWorkflowNode, SavedWorkflowEdge } from "@/lib/fastapi/workflows";
import type {
  OutputNodeType,
  WorkflowNodeType,
  BucketNodeType,
  FlowNodeType,
  NodeType,
} from "./final-review/types";
import { WORKFLOW_NODES, FLOW_NODES, BUCKET_NODES } from "./final-review/types";

const FinalReview = () => {
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
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showCompilationModal, setShowCompilationModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);

  // Custom hooks for state management
  const sourceTextsHook = useSourceTexts();
  useTranscription(sourceTextsHook.addSourceFromTranscription);
  const canvasOps = useCanvasOperations();
  const contextMenus = useContextMenus();
  const { execute, isExecuting, executionResult, error: executionError } = useWorkflowExecution();
  const { compileRaw, diagnostics, errors: compilationErrors } = useBlueprintCompile();
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

  const handleExecuteWorkflow = async () => {
    if (!canvasOps.reactFlowInstance) {
      setToast({ message: "ReactFlow instance not available", type: "error" });
      return;
    }

    let nodes = canvasOps.reactFlowInstance.getNodes();
    const edges = canvasOps.reactFlowInstance.getEdges();

    if (nodes.length === 0) {
      setToast({ message: "No nodes to execute", type: "warning" });
      return;
    }

    // Sync params from Zustand store to node.data before compilation
    // This ensures params like preset_id and aspect_ratio are available to the compiler
    // Note: Some values in storeNode.inputs are actually params (config), not runtime inputs
    const { nodes: storeNodes } = useWorkflowStore.getState();
    nodes = nodes.map((node) => {
      const storeNode = storeNodes[node.id];
      if (storeNode) {
        // Extract params from store based on node type
        // Params are configuration values, not runtime inputs from connections
        const params: Record<string, unknown> = {};
        
        if (storeNode.type === 'TextGeneration') {
          // preset_id is a param (configuration), text is a runtime input
          if (storeNode.inputs.preset_id) {
            params.preset_id = storeNode.inputs.preset_id;
          }
        } else if (storeNode.type === 'ImageGeneration') {
          // aspect_ratio is a param (configuration), prompt/image are runtime inputs
          if (storeNode.inputs.aspect_ratio) {
            params.aspect_ratio = storeNode.inputs.aspect_ratio;
          }
        } else if (storeNode.type === 'ImageBucket' || storeNode.type === 'AudioBucket' || 
                   storeNode.type === 'VideoBucket' || storeNode.type === 'TextBucket') {
          // selected_file_ids is a param for bucket nodes
          if (Array.isArray(storeNode.inputs.selected_file_ids)) {
            params.selected_file_ids = storeNode.inputs.selected_file_ids;
          }
        }
        
        // Merge params into node.data (preserving existing data)
        return {
          ...node,
          data: {
            ...node.data,
            ...params,
          },
        };
      }
      return node;
    });

    // Convert ReactFlow nodes to SavedWorkflowNode format (ensuring type is string)
    const savedNodes: SavedWorkflowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.type || 'default',
      position: node.position,
      data: node.data,
    }));

    // Convert ReactFlow edges to SavedWorkflowEdge format
    const savedEdges: SavedWorkflowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }));

    // First, compile to check for errors
    const compilationResult = await compileRaw({ nodes: savedNodes, edges: savedEdges });
    
    if (!compilationResult || !compilationResult.success) {
      // Show compilation diagnostics modal
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
      const result = await execute({ nodes: savedNodes, edges: savedEdges });
      // Always show modal if we have a result (even if execution failed)
      if (result) {
        setShowResultsModal(true);
        setToast({ 
          message: result.success 
            ? "Workflow executed successfully" 
            : "Workflow execution completed with errors", 
          type: result.success ? "success" : "warning" 
        });
      } else {
        // If no result but execution completed, still show modal with error
        setShowResultsModal(true);
        setToast({ 
          message: "Workflow execution completed but no result returned", 
          type: "warning" 
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Workflow execution failed";
      setToast({ message: errorMessage, type: "error" });
      // Show modal even on error if we have execution result
      if (executionResult) {
        setShowResultsModal(true);
      }
    }
  };

  const handleProceedWithExecution = async () => {
    if (!canvasOps.reactFlowInstance) return;
    
    const nodes = canvasOps.reactFlowInstance.getNodes();
    const edges = canvasOps.reactFlowInstance.getEdges();

    // Convert ReactFlow nodes to SavedWorkflowNode format (ensuring type is string)
    const savedNodes: SavedWorkflowNode[] = nodes.map((node) => ({
      id: node.id,
      type: node.type || 'default',
      position: node.position,
      data: node.data,
    }));

    // Convert ReactFlow edges to SavedWorkflowEdge format
    const savedEdges: SavedWorkflowEdge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    }));

    try {
      const result = await execute({ nodes: savedNodes, edges: savedEdges });
      // Always show modal if we have a result (even if execution failed)
      if (result) {
        setShowResultsModal(true);
        setToast({ 
          message: result.success 
            ? "Workflow executed successfully" 
            : "Workflow execution completed with errors", 
          type: result.success ? "success" : "warning" 
        });
      } else {
        // If no result but execution completed, still show modal with error
        setShowResultsModal(true);
        setToast({ 
          message: "Workflow execution completed but no result returned", 
          type: "warning" 
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Workflow execution failed";
      setToast({ message: errorMessage, type: "error" });
      // Show modal even on error if we have execution result
      if (executionResult) {
        setShowResultsModal(true);
      }
    }
  };

  // Show toast for execution errors
  useEffect(() => {
    if (executionError) {
      setToast({ message: executionError, type: "error" });
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
        onLoad={() => setShowLoadDialog(true)}
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

      {/* Execution Results Modal */}
      <ExecutionResultsModal
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        result={executionResult}
      />

      {/* Compilation Diagnostics Modal */}
      <CompilationDiagnosticsModal
        isOpen={showCompilationModal}
        onClose={() => setShowCompilationModal(false)}
        diagnostics={diagnostics}
        onProceed={handleProceedWithExecution}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default FinalReview;
