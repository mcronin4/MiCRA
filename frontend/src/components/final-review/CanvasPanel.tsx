import React, { useEffect, useCallback, useMemo } from "react";
import type { Node, Edge, OnConnect, ReactFlowInstance, NodeChange } from "@xyflow/react";
import AddPartMenu from "../AddPartMenu";
import PartContextMenu from "../PartContextMenu";
import { LinkedInComponent } from "../canvas/LinkedInComponent";
import { TikTokComponent } from "../canvas/TikTokComponent";
import { EmailComponent } from "../canvas/EmailComponent";
import { ImageMatchingNode } from "../workflow/nodes/ImageMatchingNode";
import { TextGenerationNode } from "../workflow/nodes/TextGenerationNode";
import { ImageGenerationNode } from "../workflow/nodes/ImageGenerationNode";
import { ImageExtractionNode } from "../workflow/nodes/ImageExtractionNode";
import { TranscriptionNode } from "../workflow/nodes/TranscriptionNode";
import { QuoteExtractionNode } from "../workflow/nodes/QuoteExtractionNode";
import { ImageBucketNode } from "../workflow/nodes/ImageBucketNode";
import { AudioBucketNode } from "../workflow/nodes/AudioBucketNode";
import { VideoBucketNode } from "../workflow/nodes/VideoBucketNode";
import { TextBucketNode } from "../workflow/nodes/TextBucketNode";
import { EndNode } from "../workflow/nodes/EndNode";
import { UnknownNode } from "../workflow/nodes/UnknownNode";
import { WorkflowManager } from "../workflow/WorkflowManager";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { getNodeSpec } from "@/lib/nodeRegistry";
import type { NodeType } from "./types";
import type { RuntimeType } from "@/types/blueprint";

const DATA_TYPE_COLORS: Record<RuntimeType, string> = {
  Text: "#10b981", // emerald-500
  ImageRef: "#3b82f6", // blue-500
  AudioRef: "#8b5cf6", // violet-500
  VideoRef: "#ec4899", // pink-500
  JSON: "#f59e0b", // amber-500
};

const nodeTypes = {
  LinkedIn: LinkedInComponent,
  TikTok: TikTokComponent,
  Email: EmailComponent,
  ImageMatching: ImageMatchingNode,
  TextGeneration: TextGenerationNode,
  ImageGeneration: ImageGenerationNode,
  Transcription: TranscriptionNode,
  ImageExtraction: ImageExtractionNode,
  QuoteExtraction: QuoteExtractionNode,
  ImageBucket: ImageBucketNode,
  AudioBucket: AudioBucketNode,
  VideoBucket: VideoBucketNode,
  TextBucket: TextBucketNode,
  End: EndNode,
  __unknown__: UnknownNode,
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
  handleAddPart: (partType: NodeType) => void;
  handleDeletePart: (
    partId: string,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isChatOpen,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setIsLocked,
  setNodesRef,
  showSaveDialog,
  showLoadDialog,
  onDialogClose,
  interactionMode = "select",
}) => {
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const removeNodeFromStore = useWorkflowStore((state) => state.removeNode);
  const workflowNodes = useWorkflowStore((state) => state.nodes);

  // Map nodes to ensure unknown types are handled gracefully
  const safeNodes = useMemo(() => {
    return nodes.map((node) => {
      // If node type doesn't exist in nodeTypes, mark it for UnknownNode
      if (node.type && !nodeTypes[node.type as keyof typeof nodeTypes]) {
        console.warn(`Unknown node type "${node.type}" for node ${node.id}. Using fallback component.`);
        return {
          ...node,
          type: '__unknown__', // Special marker for unknown types
          data: {
            ...node.data,
            originalType: node.type, // Preserve original type for display
          },
        };
      }
      return node;
    });
  }, [nodes]);

  // Create nodeTypes with fallback for unknown types
  const nodeTypesWithFallback = useMemo(() => ({
    ...nodeTypes,
    __unknown__: UnknownNode,
  }), []);

  // Wrap onNodesChange to sync deletions with Zustand store and clean up edges
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Intercept remove changes and sync with Zustand store
      for (const change of changes) {
        if (change.type === 'remove') {
          removeNodeFromStore(change.id);
          // Remove all edges connected to this node
          setEdges((eds) => eds.filter(
            (edge) => edge.source !== change.id && edge.target !== change.id
          ));
        }
      }
      // Apply all changes to ReactFlow state
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, removeNodeFromStore, setEdges]
  );

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

  const TEST_MODE_COLOR = '#94a3b8'; // slate-400 (gray)

  // Style edges based on data type and test mode
  const styledEdges = useMemo(() => {
    return edges.map((edge) => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      if (!sourceNode) return edge;

      // Get data type from source node's output port
      // Handle missing node types gracefully
      let dataType: RuntimeType | null = null;
      try {
        const nodeSpec = getNodeSpec(sourceNode.type || '');
        dataType = nodeSpec?.outputs.find(port => port.key === edge.sourceHandle)?.runtime_type || null;
      } catch {
        // Node type not found in registry - use default color
        console.warn(`Node type "${sourceNode.type}" not found in registry for edge ${edge.id}`);
      }
      
      // Check if either node is in test mode
      const sourceNodeState = workflowNodes[edge.source];
      const targetNodeState = workflowNodes[edge.target];
      const inTestMode = (sourceNodeState?.manualInputEnabled ?? false) || (targetNodeState?.manualInputEnabled ?? false);

      // Determine edge color
      let strokeColor: string;
      if (inTestMode) {
        strokeColor = TEST_MODE_COLOR;
      } else if (dataType && DATA_TYPE_COLORS[dataType]) {
        strokeColor = DATA_TYPE_COLORS[dataType];
      } else {
        strokeColor = '#94a3b8'; // default gray
      }

      return {
        ...edge,
        style: {
          ...edge.style,
          stroke: strokeColor,
          strokeWidth: 2,
        },
        markerEnd: {
          type: 'arrowclosed' as const,
          color: strokeColor,
        },
      };
    });
  }, [edges, nodes, workflowNodes]);

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
        nodes={safeNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypesWithFallback}
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
          onDelete={() => handleDeletePart(partContextMenu.partId, setNodes, setEdges)}
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
        showSaveDialogExternal={showSaveDialog}
        showLoadDialogExternal={showLoadDialog}
        onDialogClose={onDialogClose}
      />
    </div>
  );
};
