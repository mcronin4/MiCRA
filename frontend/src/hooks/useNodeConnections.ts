"use client";

import { useMemo } from "react";
import { useReactFlow } from "@xyflow/react";

export interface NodeConnection {
  inputKey: string;
  sourceNode: string;
  sourceOutput: string;
}

export function useNodeConnections(nodeId: string) {
  const { getEdges } = useReactFlow();

  const connections = useMemo(() => {
    const edges = getEdges();
    const incomingEdges = edges.filter(
      (edge) => edge.target === nodeId && edge.targetHandle
    );

    return incomingEdges.map((edge) => ({
      inputKey: edge.targetHandle || "",
      sourceNode: edge.source,
      sourceOutput: edge.sourceHandle || "",
    }));
  }, [nodeId, getEdges]);

  const hasConnections = connections.length > 0;

  return {
    hasConnections,
    connections,
  };
}


