import { useState, useRef, useCallback } from 'react';
import type { Node, ReactFlowInstance } from '@xyflow/react';
import type { NodeType, NodeContent, WorkflowNodeType } from '@/components/final-review/types';
import { WORKFLOW_NODES } from '@/components/final-review/types';
import { useWorkflowStore } from '@/lib/stores/workflowStore';

export const useCanvasOperations = () => {
  const [copiedPart, setCopiedPart] = useState<Node | null>(null);
  const [newPartPosition, setNewPartPosition] = useState<{ x: number; y: number } | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const nextId = useRef(0);
  const setNodesRef = useRef<React.Dispatch<React.SetStateAction<Node[]>> | null>(null);

  const addNodeToCanvas = useCallback((nodeType: NodeType, content?: string | NodeContent) => {
    if (!setNodesRef.current || !reactFlowInstance) return;

    // Add node in the center of the canvas
    const viewport = reactFlowInstance.getViewport();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;

    const newNodeId = `${nodeType}-${nextId.current++}`;

    // For workflow nodes, initialize in Zustand store
    if (WORKFLOW_NODES.includes(nodeType as WorkflowNodeType)) {
      useWorkflowStore.getState().addNode({
        id: newNodeId,
        type: nodeType,
        status: 'idle',
        inputs: {},
        outputs: null,
      });
    }

    // Handle both string content and structured content
    let nodeData: NodeContent = { label: `${nodeType} node` };
    
    if (content) {
      if (typeof content === 'string') {
        nodeData.content = content;
      } else if (typeof content === 'object') {
        // Merge structured content into node data
        nodeData = { ...nodeData, ...content };
      }
    }

    const newNode: Node = {
      id: newNodeId,
      type: nodeType,
      position: { x: centerX - 250, y: centerY - 200 }, // Offset to center the node
      data: nodeData,
    };

    setNodesRef.current((nds: Node[]) => nds.concat(newNode));
  }, [reactFlowInstance]);

  const handleDeletePart = (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => {
    setNodes((nds: Node[]) => nds.filter((node) => node.id !== partId));
  };

  const handleDuplicatePart = (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>, nodes: Node[]) => {
    const partToDuplicate = nodes.find((node) => node.id === partId);
    if (partToDuplicate) {
      const newNode: Node = {
        ...partToDuplicate,
        id: `${partToDuplicate.type}-${nextId.current++}`,
        position: {
          x: partToDuplicate.position.x + 20,
          y: partToDuplicate.position.y + 20,
        },
      };
      setNodes((nds: Node[]) => nds.concat(newNode));
    }
  };

  const handleCopyPart = (partId: string, nodes: Node[]) => {
    const partToCopy = nodes.find((node) => node.id === partId);
    if (partToCopy) {
      setCopiedPart(partToCopy);
    }
  };

  const handlePastePart = (setNodes: React.Dispatch<React.SetStateAction<Node[]>>) => {
    if (copiedPart && newPartPosition && reactFlowInstance) {
      const position = reactFlowInstance.screenToFlowPosition({
        x: newPartPosition.x,
        y: newPartPosition.y,
      });
      const newNode: Node = {
        ...copiedPart,
        id: `${copiedPart.type}-${nextId.current++}`,
        position,
      };
      setNodes((nds: Node[]) => nds.concat(newNode));
    }
  };

  return {
    copiedPart,
    newPartPosition,
    setNewPartPosition,
    reactFlowInstance,
    setReactFlowInstance,
    isLocked,
    setIsLocked,
    setNodesRef,
    addNodeToCanvas,
    handleDeletePart,
    handleDuplicatePart,
    handleCopyPart,
    handlePastePart,
  };
};

