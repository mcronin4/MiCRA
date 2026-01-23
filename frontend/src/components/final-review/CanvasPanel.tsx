import React, { useEffect, useCallback, useState } from "react";
import type { Node, Edge, OnConnect, ReactFlowInstance } from "@xyflow/react";
import { PanelRight, Plus } from "lucide-react";
import AddPartMenu from "../AddPartMenu";
import ZoomControls from "../ZoomControls";
import PartContextMenu from "../PartContextMenu";
import { LinkedInComponent } from "../canvas/LinkedInComponent";
import { TikTokComponent } from "../canvas/TikTokComponent";
import { EmailComponent } from "../canvas/EmailComponent";
import { ImageMatchingNode } from "../workflow/nodes/ImageMatchingNode";
import { TextGenerationNode } from "../workflow/nodes/TextGenerationNode";
import { ImageGenerationNode } from "../workflow/nodes/ImageGenerationNode";
import { WorkflowManager } from "../workflow/WorkflowManager";
import type { OutputNodeType, WorkflowNodeType } from "./types";

const nodeTypes = {
  LinkedIn: LinkedInComponent,
  TikTok: TikTokComponent,
  Email: EmailComponent,
  ImageMatching: ImageMatchingNode,
  TextGeneration: TextGenerationNode,
  ImageGeneration: ImageGenerationNode,
};

interface CanvasPanelProps {
  ReactFlow: React.ComponentType<Record<string, unknown>>;
  Background: React.ComponentType<Record<string, unknown>>;
  MiniMap: React.ComponentType<Record<string, unknown>>;
  useNodesState: <T extends Node = Node>(
    initial: T[],
  ) => [
    T[],
    React.Dispatch<React.SetStateAction<T[]>>,
    (changes: unknown) => void,
  ];
  useEdgesState: <T extends Edge = Edge>(
    initial: T[],
  ) => [
    T[],
    React.Dispatch<React.SetStateAction<T[]>>,
    (changes: unknown) => void,
  ];
  addEdge: (edgeParams: unknown, edges: Edge[]) => Edge[];
  isChatOpen: boolean;
  setIsChatOpen: (visible: boolean) => void;
  menuPosition: { x: number; y: number } | null;
  setMenuPosition: (position: { x: number; y: number } | null) => void;
  partContextMenu: { x: number; y: number; partId: string } | null;
  setPartContextMenu: (
    menu: { x: number; y: number; partId: string } | null,
  ) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  handleCanvasContextMenu: (e: React.MouseEvent) => void;
  handlePartContextMenu: (
    e: React.MouseEvent<HTMLDivElement>,
    partId: string,
  ) => void;
  handleAddPart: (partType: OutputNodeType | WorkflowNodeType) => void;
  handleDeletePart: (
    partId: string,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  ) => void;
  handleDuplicatePart: (
    partId: string,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    nodes: Node[],
  ) => void;
  handleCopyContent: (partId: string, nodes: Node[]) => void;
  reactFlowInstance: ReactFlowInstance | null;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  setNodesRef: React.MutableRefObject<React.Dispatch<
    React.SetStateAction<Node[]>
  > | null>;
  showSaveDialog?: boolean;
  showLoadDialog?: boolean;
  onDialogClose?: () => void;
  interactionMode?: "select" | "pan";
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  isChatOpen,
  setIsChatOpen,
  menuPosition,
  setMenuPosition,
  partContextMenu,
  setPartContextMenu,
  canvasContainerRef,
  handleCanvasContextMenu,
  handlePartContextMenu,
  handleAddPart,
  handleDeletePart,
  handleDuplicatePart,
  handleCopyContent,
  reactFlowInstance,
  setReactFlowInstance,
  isLocked,
  setIsLocked,
  setNodesRef,
  showSaveDialog,
  showLoadDialog,
  onDialogClose,
  interactionMode = "select",
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<
    string | undefined
  >();

  // Store setNodes in the parent's ref
  useEffect(() => {
    if (setNodesRef) {
      setNodesRef.current = setNodes;
    }
  }, [setNodesRef, setNodes]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges, addEdge],
  );

  return (
    <div
      ref={canvasContainerRef}
      className={`flex-1 h-full relative bg-[#f0f2f5] overflow-hidden ${
        interactionMode === "pan" ? "view-only-mode" : ""
      }`}
      style={interactionMode === "pan" ? { cursor: "grab" } : undefined}
    >
      {/* Style to disable all node interactions in pan/view mode */}
      {interactionMode === "pan" && (
        <style>{`
          .view-only-mode .react-flow__node * {
            pointer-events: none !important;
          }
          .view-only-mode .react-flow__node {
            cursor: grab !important;
          }
          .view-only-mode:active {
            cursor: grabbing !important;
          }
        `}</style>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        onPaneContextMenu={handleCanvasContextMenu}
        onNodeContextMenu={(
          event: React.MouseEvent<HTMLDivElement>,
          node: Node,
        ) => handlePartContextMenu(event, node.id)}
        fitView
        nodesDraggable={!isLocked && interactionMode === "select"}
        nodesConnectable={!isLocked && interactionMode === "select"}
        panOnDrag={interactionMode === "pan" ? true : [1, 2]}
        selectionOnDrag={!isLocked && interactionMode === "select"}
        zoomOnScroll={true}
        zoomOnDoubleClick={!isLocked}
        panOnScroll={true}
      >
        <Background />
        <MiniMap position="bottom-left" />
      </ReactFlow>

      {menuPosition && (
        <AddPartMenu
          onAddPart={(partType) => handleAddPart(partType)}
          onClose={() => setMenuPosition(null)}
          position={menuPosition}
        />
      )}
      {partContextMenu && (
        <PartContextMenu
          position={{ x: partContextMenu.x, y: partContextMenu.y }}
          onDelete={() => handleDeletePart(partContextMenu.partId, setNodes)}
          onDuplicate={() =>
            handleDuplicatePart(partContextMenu.partId, setNodes, nodes)
          }
          onCopy={() => handleCopyContent(partContextMenu.partId, nodes)}
          onClose={() => setPartContextMenu(null)}
        />
      )}
      {/* Removed: ZoomControls, floating + button, chat toggle - now in ExecutionBar */}

      {/* Workflow Manager - Save/Load functionality */}
      <WorkflowManager
        reactFlowNodes={nodes}
        reactFlowEdges={edges}
        reactFlowInstance={reactFlowInstance}
        setNodes={setNodes}
        setEdges={setEdges}
        currentWorkflowId={currentWorkflowId}
        onWorkflowChanged={setCurrentWorkflowId}
        showSaveDialogExternal={showSaveDialog}
        showLoadDialogExternal={showLoadDialog}
        onDialogClose={onDialogClose}
      />
    </div>
  );
};
