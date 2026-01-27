import React, { useEffect, useCallback, useState } from 'react';
import type { Node, Edge, OnConnect, ReactFlowInstance } from '@xyflow/react';
import { PanelLeft, PanelRight } from 'lucide-react';
import AddPartMenu from '../AddPartMenu';
import ZoomControls from '../ZoomControls';
import PartContextMenu from '../PartContextMenu';
import { LinkedInComponent } from '../canvas/LinkedInComponent';
import { TikTokComponent } from '../canvas/TikTokComponent';
import { EmailComponent } from '../canvas/EmailComponent';
import { ImageMatchingNode } from '../workflow/nodes/ImageMatchingNode';
import { TextGenerationNode } from '../workflow/nodes/TextGenerationNode';
import { ImageExtractionNode } from '../workflow/nodes/ImageExtractionNode';
import { WorkflowManager } from '../workflow/WorkflowManager';
import type { OutputNodeType, WorkflowNodeType } from './types';

const nodeTypes = {
  LinkedIn: LinkedInComponent,
  TikTok: TikTokComponent,
  Email: EmailComponent,
  ImageMatching: ImageMatchingNode,
  TextGeneration: TextGenerationNode,
  ImageExtraction: ImageExtractionNode,
  // Add more nodes here as they are created! (e.g., 'Transcription', 'ImageExtraction')
};

interface CanvasPanelProps {
  ReactFlow: React.ComponentType<Record<string, unknown>>;
  Background: React.ComponentType<Record<string, unknown>>;
  MiniMap: React.ComponentType<Record<string, unknown>>;
  useNodesState: <T extends Node = Node>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  useEdgesState: <T extends Edge = Edge>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  addEdge: (edgeParams: unknown, edges: Edge[]) => Edge[];
  sidebarsVisible: boolean;
  setSidebarsVisible: (visible: boolean) => void;
  menuPosition: { x: number; y: number } | null;
  setMenuPosition: (position: { x: number; y: number } | null) => void;
  partContextMenu: { x: number; y: number; partId: string } | null;
  setPartContextMenu: (menu: { x: number; y: number; partId: string } | null) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  handleCanvasContextMenu: (e: React.MouseEvent) => void;
  handlePartContextMenu: (e: React.MouseEvent<HTMLDivElement>, partId: string) => void;
  handleAddPart: (partType: OutputNodeType | WorkflowNodeType) => void;
  handleDeletePart: (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => void;
  handleDuplicatePart: (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>, nodes: Node[]) => void;
  handleCopyContent: (partId: string, nodes: Node[]) => void;
  reactFlowInstance: ReactFlowInstance | null;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  isLocked: boolean;
  setIsLocked: (locked: boolean) => void;
  setNodesRef: React.MutableRefObject<React.Dispatch<React.SetStateAction<Node[]>> | null>;
}

export const CanvasPanel: React.FC<CanvasPanelProps> = ({
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  sidebarsVisible,
  setSidebarsVisible,
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
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | undefined>();
  
  // Store setNodes in the parent's ref
  useEffect(() => {
    if (setNodesRef) {
      setNodesRef.current = setNodes;
    }
  }, [setNodesRef, setNodes]);
  
  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges, addEdge]
  );

  return (
    <div
      ref={canvasContainerRef}
      className="flex-1 h-full relative bg-[#f0f2f5] overflow-hidden"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        onPaneContextMenu={handleCanvasContextMenu}
        onNodeContextMenu={(event: React.MouseEvent<HTMLDivElement>, node: Node) => handlePartContextMenu(event, node.id)}
        fitView
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        panOnDrag={!isLocked}
        zoomOnScroll={!isLocked}
        zoomOnDoubleClick={!isLocked}
        panOnScroll={!isLocked}
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
          onDuplicate={() => handleDuplicatePart(partContextMenu.partId, setNodes, nodes)}
          onCopy={() => handleCopyContent(partContextMenu.partId, nodes)}
          onClose={() => setPartContextMenu(null)}
        />
      )}
      <ZoomControls
        onZoomIn={() => reactFlowInstance?.zoomIn()}
        onZoomOut={() => reactFlowInstance?.zoomOut()}
        onFitView={() => reactFlowInstance?.fitView()}
        onToggleLock={() => setIsLocked(!isLocked)}
        isLocked={isLocked}
      />
      <button
        onClick={() => setSidebarsVisible(!sidebarsVisible)}
        className="absolute top-4 left-4 bg-white/80 backdrop-blur-lg p-2 rounded-lg shadow-lg"
      >
        {sidebarsVisible ? <PanelLeft size={20} /> : <PanelRight size={20} />}
      </button>
      
      {/* Workflow Manager - Save/Load functionality */}
      <WorkflowManager
        reactFlowNodes={nodes}
        reactFlowEdges={edges}
        reactFlowInstance={reactFlowInstance}
        setNodes={setNodes}
        setEdges={setEdges}
        currentWorkflowId={currentWorkflowId}
        onWorkflowChanged={setCurrentWorkflowId}
      />
    </div>
  );
};

