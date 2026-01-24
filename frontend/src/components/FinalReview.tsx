"use client";
import React, { useState } from "react";
import { ReactFlowWrapper } from "./canvas/ReactFlowWrapper";
import { ChatPanel } from "./final-review/ChatPanel";
import { CanvasPanel } from "./final-review/CanvasPanel";
import { NodeSidebar } from "./workflow/NodeSidebar";
import { TopNavBar } from "./workflow/TopNavBar";
import { ExecutionBar } from "./workflow/ExecutionBar";
import { useSourceTexts } from "@/hooks/useSourceTexts";
import { useTranscription } from "@/hooks/useTranscription";
import { useChatConversation } from "@/hooks/useChatConversation";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { useContextMenus } from "@/hooks/useContextMenus";
import type {
  SourceType,
  OutputNodeType,
  WorkflowNodeType,
  FlowNodeType,
  NodeType,
} from "./final-review/types";
import { WORKFLOW_NODES, FLOW_NODES } from "./final-review/types";

const FinalReview = () => {
  const [activeTab, setActiveTab] = useState<SourceType>("Video");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [workflowName, setWorkflowName] = useState("Untitled Workflow");
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">(
    "select",
  );
  const [isExecuting, setIsExecuting] = useState(false);
  // Dialog control for WorkflowManager
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  // Simple undo/redo state (placeholder - would need proper history management)
  const [undoStack, setUndoStack] = useState<unknown[]>([]);
  const [redoStack, setRedoStack] = useState<unknown[]>([]);

  // Custom hooks for state management
  const sourceTextsHook = useSourceTexts();
  const transcriptionHook = useTranscription(
    sourceTextsHook.addSourceFromTranscription,
  );
  const canvasOps = useCanvasOperations();
  const contextMenus = useContextMenus();
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
    // Check if it's a workflow node or flow node - if so, just add it directly to canvas
    if (
      WORKFLOW_NODES.includes(partType as WorkflowNodeType) ||
      FLOW_NODES.includes(partType as FlowNodeType)
    ) {
      canvasOps.addNodeToCanvas(partType as WorkflowNodeType);
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
    setIsExecuting(true);
    console.log("Executing workflow...");
    // TODO: Implement actual workflow execution
    // Simulate execution time
    setTimeout(() => {
      setIsExecuting(false);
      console.log("Workflow execution complete");
    }, 2000);
  };

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
        workflowName={workflowName}
        onWorkflowNameChange={setWorkflowName}
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
    </div>
  );
};

export default FinalReview;
