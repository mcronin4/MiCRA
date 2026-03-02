"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ReactFlowWrapper } from "./ReactFlowWrapper";
import { CanvasPanel } from "./CanvasPanel";
import { MicrAIDock } from "./MicrAIDock";
import { MicrAIBuildOverlay } from "./MicrAIBuildOverlay";
import { NodeSidebar } from "./NodeSidebar";
import { TopNavBar } from "./TopNavBar";
import { ExecutionBar } from "./ExecutionBar";
import { CompilationDiagnosticsModal } from "./CompilationDiagnosticsModal";
import { showToast } from "@/lib/stores/toastStore";
import { useWorkflowCopilot } from "@/hooks/useWorkflowCopilot";
import { useMicrAIBuildPlayback } from "@/hooks/useMicrAIBuildPlayback";
import { useMicrAIVoiceInput } from "@/hooks/useMicrAIVoiceInput";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { useContextMenus } from "@/hooks/useContextMenus";
import { useWorkflowExecution } from "@/hooks/useWorkflowExecution";
import { useBlueprintCompile } from "@/hooks/useBlueprintCompile";
import type { SavedWorkflowData } from "@/lib/fastapi/workflows";
import { layoutWorkflowData } from "@/lib/workflowLayout";
import {
  useWorkflowStore,
  getParamKeysToPersist,
  sanitizeWorkflowEdgesAgainstRegistry,
} from "@/lib/stores/workflowStore";
import { listFiles } from "@/lib/fastapi/files";
import type {
  WorkflowNodeType,
  BucketNodeType,
  FlowNodeType,
  NodeType,
} from "./types";
import { WORKFLOW_NODES, FLOW_NODES, BUCKET_NODES } from "./types";

const LEGACY_OUTPUT_NODE_TYPES = new Set(["LinkedIn", "TikTok", "Email"]);
const MICRAI_GUIDED_BUILD_ENABLED =
  process.env.NEXT_PUBLIC_MICRAI_GUIDED_BUILD_ENABLED !== "false";
const MICRAI_RELEASE_TAIL_LISTEN_MS = 380;

interface WorkflowBuilderProps {
  autoLoadWorkflowId?: string | null;
  onAutoLoadComplete?: () => void;
}

const WorkflowBuilder = ({ autoLoadWorkflowId, onAutoLoadComplete }: WorkflowBuilderProps = {}) => {
  const [interactionMode, setInteractionMode] = useState<"select" | "pan">(
    "select",
  );
  const [isMicrAIOpen, setIsMicrAIOpen] = useState(false);
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
  const legacyCleanupToastShownRef = useRef(false);
  const [lastMicrAIPatchSnapshot, setLastMicrAIPatchSnapshot] = useState<SavedWorkflowData | null>(null);
  const launcherHoldTimerRef = useRef<number | null>(null);
  const launcherReleaseTailTimerRef = useRef<number | null>(null);
  const launcherStartRecordingPromiseRef = useRef<Promise<boolean> | null>(null);
  const launcherHoldActiveRef = useRef(false);
  const launcherPointerDownRef = useRef(false);

  const router = useRouter();

  // Custom hooks for state management
  const copilot = useWorkflowCopilot();
  const playback = useMicrAIBuildPlayback();
  const voice = useMicrAIVoiceInput();
  const canvasOps = useCanvasOperations();
  const contextMenus = useContextMenus();
  const { execute, isExecuting, executionResult, error: executionError, cancelExecution } = useWorkflowExecution();
  const { compileRaw, diagnostics, errors: compilationErrors } = useBlueprintCompile();
  const currentWorkflowId = useWorkflowStore((s) => s.currentWorkflowId);

  // Prefetch all file types on mount so backend cache is warm before any bucket is created
  useEffect(() => {
    const types = ["image", "audio", "video", "text"] as const;
    types.forEach((t) => {
      listFiles({
        type: t,
        status: "uploaded",
        includeUrls: t === "image",
        thumbnailsOnly: t === "image",
        limit: 100,
      }).catch(() => {}); // fire-and-forget; errors are non-critical
    });
  }, []);

  const handleAddPart = (partType: NodeType) => {
    // Add workflow/bucket/flow nodes directly to canvas.
    if (
      WORKFLOW_NODES.includes(partType as WorkflowNodeType) ||
      BUCKET_NODES.includes(partType as BucketNodeType) ||
      FLOW_NODES.includes(partType as FlowNodeType)
    ) {
      canvasOps.addNodeToCanvas(partType as WorkflowNodeType | BucketNodeType);
      contextMenus.setMenuPosition(null);
      return;
    }

    // Legacy output nodes are deprecated in builder flow.
    if (LEGACY_OUTPUT_NODE_TYPES.has(partType)) {
      showToast("Legacy output nodes are deprecated. Use End node + Preview.", "warning");
      contextMenus.setMenuPosition(null);
      return;
    }

    contextMenus.setMenuPosition(null);
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

    const executableCanvasNodes = nodes.filter(
      (node) => !LEGACY_OUTPUT_NODE_TYPES.has(node.type || "")
    );
    const executableCanvasNodeIds = new Set(
      executableCanvasNodes.map((node) => node.id)
    );
    const candidateExecutionEdges = edges
      .filter(
        (edge) =>
          executableCanvasNodeIds.has(edge.source) &&
          executableCanvasNodeIds.has(edge.target)
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      }));
    const { removedCount: removedLegacyEdges } =
      sanitizeWorkflowEdgesAgainstRegistry(
        executableCanvasNodes.map((node) => ({
          id: node.id,
          type: node.type || "default",
        })),
        candidateExecutionEdges
      );

    if (removedLegacyEdges > 0 && !legacyCleanupToastShownRef.current) {
      showToast("Removed legacy invalid connections from this workflow.", "warning");
      legacyCleanupToastShownRef.current = true;
    }

    // Use the store's exportWorkflowForExecution which handles bucket nodes + edge sanitization
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

    const executableNodeIds = new Set(
      workflowData.nodes
        .filter((node) => !LEGACY_OUTPUT_NODE_TYPES.has(node.type))
        .map((node) => node.id)
    );

    workflowData.nodes = workflowData.nodes.filter((node) =>
      executableNodeIds.has(node.id)
    );
    workflowData.edges = workflowData.edges.filter(
      (edge) =>
        executableNodeIds.has(edge.source) && executableNodeIds.has(edge.target)
    );

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

  const exportCurrentWorkflowForPlanning = (): SavedWorkflowData => {
    const store = useWorkflowStore.getState();
    const nodes = canvasOps.reactFlowInstance?.getNodes() ?? store.reactFlowNodes;
    const edges = canvasOps.reactFlowInstance?.getEdges() ?? store.reactFlowEdges;
    return store.exportWorkflowStructure(nodes, edges);
  };

  const applyWorkflowToCanvas = (
    workflowData: SavedWorkflowData,
    options?: { fitView?: boolean }
  ) => {
    const store = useWorkflowStore.getState();
    const imported = store.importWorkflowStructure(workflowData);
    canvasOps.setNodesRef.current?.(() => imported.reactFlowNodes);
    canvasOps.setEdgesRef.current?.(() => imported.reactFlowEdges);
    if (options?.fitView ?? true) {
      setTimeout(() => {
        canvasOps.reactFlowInstance?.fitView({ padding: 0.2 });
      }, 0);
    }
  };

  const handleMicrAIPlan = async () => {
    const message = copilot.prompt.trim();
    if (!message) {
      showToast("Enter a MicrAI request first.", "warning");
      return;
    }
    await requestMicrAIPlan(message);
  };

  const requestMicrAIPlan = async (message: string) => {
    if (!message) {
      showToast("Enter a MicrAI request first.", "warning");
      return;
    }

    const current = exportCurrentWorkflowForPlanning();
    try {
      const response = await copilot.requestPlan({
        message,
        mode: copilot.mode,
        workflowData: current,
      });
      if (response.status === "clarify") {
        showToast("MicrAI needs clarification before applying changes.", "warning");
      } else if (response.status === "error") {
        showToast("MicrAI could not produce a valid plan.", "error");
      }
    } catch {
      showToast("MicrAI planning failed. Check logs and retry.", "error");
    }
  };

  const clearLauncherHoldTimer = () => {
    if (launcherHoldTimerRef.current !== null) {
      window.clearTimeout(launcherHoldTimerRef.current);
      launcherHoldTimerRef.current = null;
    }
  };

  const clearLauncherReleaseTailTimer = () => {
    if (launcherReleaseTailTimerRef.current !== null) {
      window.clearTimeout(launcherReleaseTailTimerRef.current);
      launcherReleaseTailTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLauncherHoldTimer();
      clearLauncherReleaseTailTimer();
      launcherStartRecordingPromiseRef.current = null;
      void voice.cancelRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLauncherPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (playback.isActive || voice.isTranscribing || copilot.isPlanning) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.currentTarget.setPointerCapture) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // ignore capture failures
      }
    }
    launcherPointerDownRef.current = true;
    launcherHoldActiveRef.current = false;
    clearLauncherHoldTimer();
    launcherHoldTimerRef.current = window.setTimeout(() => {
      if (!launcherPointerDownRef.current) return;
      launcherHoldActiveRef.current = true;
      setIsMicrAIOpen(true);
      const startPromise = voice.startRecording();
      launcherStartRecordingPromiseRef.current = startPromise;
      void startPromise.then((started) => {
        if (launcherStartRecordingPromiseRef.current !== startPromise) return;
        launcherStartRecordingPromiseRef.current = null;
        if (!started) {
          launcherHoldActiveRef.current = false;
          showToast("Could not start microphone.", "error");
        }
      });
    }, 240);
  };

  const finishLauncherPress = () => {
    launcherPointerDownRef.current = false;
    clearLauncherHoldTimer();

    if (launcherHoldActiveRef.current) {
      launcherHoldActiveRef.current = false;
      clearLauncherReleaseTailTimer();
      launcherReleaseTailTimerRef.current = window.setTimeout(() => {
        void (async () => {
          const pendingStart = launcherStartRecordingPromiseRef.current;
          if (pendingStart) {
            try {
              await pendingStart;
            } catch {
              // ignore start errors; handled by start flow toast
            } finally {
              if (launcherStartRecordingPromiseRef.current === pendingStart) {
                launcherStartRecordingPromiseRef.current = null;
              }
            }
          }
          const transcript = await voice.stopRecordingAndTranscribe();
          if (!transcript) {
            showToast("No speech detected.", "warning");
            return;
          }
          copilot.setPrompt(transcript);
          await requestMicrAIPlan(transcript);
        })();
        launcherReleaseTailTimerRef.current = null;
      }, MICRAI_RELEASE_TAIL_LISTEN_MS);
      return;
    }

    if (voice.isRecording) return;
    setIsMicrAIOpen((prev) => !prev);
  };

  const handleDockVoiceToggle = () => {
    if (playback.isActive || voice.isTranscribing || copilot.isPlanning) return;
    if (voice.isRecording) {
      void (async () => {
        const transcript = await voice.stopRecordingAndTranscribe();
        if (!transcript) {
          showToast("No speech detected.", "warning");
          return;
        }
        copilot.setPrompt(transcript);
      })();
      return;
    }
    setIsMicrAIOpen(true);
    void voice.startRecording().then((started) => {
      if (!started) {
        showToast("Could not start microphone.", "error");
      }
    });
  };

  const handleMicrAIApply = () => {
    if (playback.isActive) return;
    const plan = copilot.pendingPlan;
    if (!plan || plan.status !== "ready" || !plan.workflow_data) {
      return;
    }

    const current = exportCurrentWorkflowForPlanning();
    const isCreateReplace = copilot.mode === "create" && current.nodes.length > 0;
    if (isCreateReplace && plan.requires_replace_confirmation) {
      const confirmed = window.confirm(
        "Apply MicrAI create plan and replace the current canvas?"
      );
      if (!confirmed) return;
    }

    const layoutMode = copilot.mode === "edit" ? "touched" : "full";
    const laidOut = layoutWorkflowData(plan.workflow_data, {
      mode: layoutMode,
      touchedNodeIds: plan.touched_node_ids,
    });
    const hasGuidedSteps = (plan.build_steps?.length ?? 0) > 0;
    copilot.clearPlan();

    setLastMicrAIPatchSnapshot(current);
    if (MICRAI_GUIDED_BUILD_ENABLED && hasGuidedSteps) {
      setIsMicrAIOpen(true);
      void playback.startPlayback({
        mode: copilot.mode,
        steps: plan.build_steps ?? [],
        closingNarration: plan.closing_narration,
        currentWorkflow: current,
        finalWorkflow: laidOut,
        canvasContainerRef: contextMenus.canvasContainerRef,
        getViewport: () => canvasOps.reactFlowInstance?.getViewport() ?? null,
        applyWorkflow: (workflowData) =>
          applyWorkflowToCanvas(workflowData, { fitView: false }),
        onComplete: () => {
          applyWorkflowToCanvas(laidOut, { fitView: true });
          showToast("MicrAI patch applied.", "success");
        },
        onError: (error) => {
          applyWorkflowToCanvas(current, { fitView: true });
          showToast(
            `MicrAI guided build failed: ${error.message}`,
            "error"
          );
        },
      });
      return;
    }
    if (MICRAI_GUIDED_BUILD_ENABLED && !hasGuidedSteps) {
      showToast(
        "MicrAI guided steps were missing for this plan, so it was applied instantly.",
        "warning"
      );
    }

    applyWorkflowToCanvas(laidOut, { fitView: true });
    showToast("MicrAI patch applied.", "success");
  };

  const handleMicrAIUndoPatch = () => {
    if (!lastMicrAIPatchSnapshot) {
      showToast("No MicrAI patch to undo.", "warning");
      return;
    }
    applyWorkflowToCanvas(lastMicrAIPatchSnapshot);
    setLastMicrAIPatchSnapshot(null);
    showToast("Reverted last MicrAI patch.", "success");
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
        showToast("Workflow execution canceled", "warning");
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
        showToast("Workflow execution canceled", "warning");
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
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <ReactFlowWrapper>
            {(flowProps) => (
              <CanvasPanel
                {...flowProps}
                isChatOpen={false}
                setIsChatOpen={() => {}}
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
                setEdgesRef={canvasOps.setEdgesRef}
                showSaveDialog={showSaveDialog}
                showLoadDialog={showLoadDialog}
                onDialogClose={() => {
                  setShowSaveDialog(false);
                  setShowLoadDialog(false);
                }}
                interactionMode={interactionMode}
                isMicrAIPlaybackActive={playback.isActive}
                autoLoadWorkflowId={autoLoadWorkflowId}
                onAutoLoadComplete={onAutoLoadComplete}
              />
            )}
          </ReactFlowWrapper>

          <MicrAIBuildOverlay
            robot={playback.robot}
            speech={playback.speech}
            trail={playback.trail}
          />

          {/* Bottom Execution Bar */}
          <ExecutionBar
            reactFlowInstance={canvasOps.reactFlowInstance}
            showChatToggle={false}
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
            onCancelExecution={cancelExecution}
            onViewResults={() => {
              if (currentWorkflowId) router.push(`/preview/${currentWorkflowId}`);
            }}
          />

          {!playback.isActive && (
            <button
              type="button"
              onPointerDown={handleLauncherPointerDown}
              onPointerUp={finishLauncherPress}
              onPointerCancel={finishLauncherPress}
              onDragStart={(event) => event.preventDefault()}
              draggable={false}
              className="absolute right-6 bottom-24 z-50 p-0 bg-transparent border-0 shadow-none transition-transform hover:scale-[1.03]"
              title={isMicrAIOpen ? "Hide MicrAI" : "Open MicrAI"}
            >
              {voice.isRecording && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-xl border border-violet-200 bg-white/90 px-2 py-1 shadow-sm">
                  <div className="flex items-end gap-[3px] h-6">
                    {[0, 1, 2, 3, 4].map((idx) => {
                      const spread = Math.max(0.25, 1 - Math.abs(idx - 2) * 0.22);
                      const h = 4 + voice.level * 18 * spread;
                      return (
                        <span
                          key={idx}
                          className="w-[4px] rounded-full bg-violet-500"
                          style={{ height: `${h}px` }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              <Image
                src="/robot-full-body.png"
                alt="MicrAI"
                width={112}
                height={112}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                className="block select-none pointer-events-none saturate-[1.35] brightness-[1.2] contrast-[1.2]"
              />
            </button>
          )}

          {isMicrAIOpen && (
            <MicrAIDock
              prompt={copilot.prompt}
              onPromptChange={copilot.setPrompt}
              mode={copilot.mode}
              onModeChange={copilot.setMode}
              isPlanning={copilot.isPlanning}
              error={copilot.error}
              pendingPlan={copilot.pendingPlan}
              onPlan={handleMicrAIPlan}
              onApply={handleMicrAIApply}
              onDismissPlan={copilot.clearPlan}
              onUndoPatch={handleMicrAIUndoPatch}
              canUndoPatch={!!lastMicrAIPatchSnapshot}
              isPlaybackActive={playback.isActive}
              playbackSpeed={playback.speedMultiplier}
              onPlaybackSpeedChange={playback.setSpeedMultiplier}
              onSkipPlayback={playback.skipPlayback}
              isVoiceRecording={voice.isRecording}
              isVoiceBusy={voice.isTranscribing}
              voiceLevel={voice.level}
              onVoiceToggle={handleDockVoiceToggle}
              onClose={() => setIsMicrAIOpen(false)}
            />
          )}
        </div>
      </div>

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

export default WorkflowBuilder;
