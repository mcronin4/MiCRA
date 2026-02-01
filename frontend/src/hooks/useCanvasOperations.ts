import { useState, useRef, useCallback } from 'react';
import type { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import type { NodeType, NodeContent, WorkflowNodeType, BucketNodeType } from '@/components/final-review/types';
import { WORKFLOW_NODES, BUCKET_NODES } from '@/components/final-review/types';
import { useWorkflowStore } from '@/lib/stores/workflowStore';

export const useCanvasOperations = () => {
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const nextId = useRef(0);
  const setNodesRef = useRef<React.Dispatch<React.SetStateAction<Node[]>> | null>(null);

  const addNodeToCanvas = useCallback((nodeType: NodeType, content?: string | NodeContent, position?: { x: number, y: number}): string | undefined => {
    if (!setNodesRef.current || !reactFlowInstance) return undefined;


    let nodePosition;
    if (position) {
      nodePosition = position;
    }
    else {
      // Add node in the center of the canvas if no position passed
      const viewport = reactFlowInstance.getViewport();
      const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
      const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
      nodePosition =  { x: centerX - 250, y: centerY - 200 };
    }

    const newNodeId = `${nodeType}-${nextId.current++}`;

    // For workflow nodes and bucket nodes, initialize in Zustand store
    if (WORKFLOW_NODES.includes(nodeType as WorkflowNodeType) || BUCKET_NODES.includes(nodeType as BucketNodeType)) {
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
    
    // Initialize bucket nodes with empty selected_file_ids array
    if (BUCKET_NODES.includes(nodeType as BucketNodeType)) {
      nodeData.params = { selected_file_ids: [] };
    }
    
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
      position: nodePosition, // Offset to center the node
      data: nodeData,
    };

    setNodesRef.current((nds: Node[]) => nds.concat(newNode));
    return newNodeId
  }, [reactFlowInstance]);

  const handleDeletePart = (
    partId: string,
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
  ) => {
    // Remove from React Flow canvas
    setNodes((nds: Node[]) => nds.filter((node) => node.id !== partId));

    // Remove all edges connected to this node
    setEdges((eds: Edge[]) => eds.filter(
      (edge) => edge.source !== partId && edge.target !== partId
    ));

    // Also delete from Zustand store (safe to call even if node doesn't exist in store)
    useWorkflowStore.getState().removeNode(partId);
  };

  const handleDuplicatePart = (partId: string, setNodes: React.Dispatch<React.SetStateAction<Node[]>>, nodes: Node[]) => {
    const partToDuplicate = nodes.find((node) => node.id === partId);
    if (partToDuplicate) {
      addNodeToCanvas(
        partToDuplicate.type as NodeType, 
        partToDuplicate.data, 
        { x: partToDuplicate.position.x + 20, y: partToDuplicate.position.y + 20 }
      );
    }
  };

  const handleCopyContent = (partId: string, nodes: Node[]) => {
    const partToCopy = nodes.find((node) => node.id === partId);
    if (partToCopy) {
      // Copy the actual text content to clipboard
      const content = partToCopy.data?.content;
      if (content && typeof content === 'string') {
        navigator.clipboard.writeText(content).catch((err) => {
          console.error('Failed to copy text to clipboard:', err);
        });
      }
    }
  };

  return {
    reactFlowInstance,
    setReactFlowInstance,
    isLocked,
    setIsLocked,
    setNodesRef,
    addNodeToCanvas,
    handleDeletePart,
    handleDuplicatePart,
    handleCopyContent,
  };
};

