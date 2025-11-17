import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Edge, Node } from "@xyflow/react";

interface ReactFlowComponents {
  ReactFlow: React.ComponentType<Record<string, unknown>>;
  ReactFlowProvider: React.ComponentType<{ children: React.ReactNode }>;
  Background: React.ComponentType<Record<string, unknown>>;
  Controls: React.ComponentType<Record<string, unknown>>;
  MiniMap: React.ComponentType<Record<string, unknown>>;
  useNodesState: <T extends Node = Node>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  useEdgesState: <T extends Edge = Edge>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void];
  addEdge: (edgeParams: unknown, edges: Edge[]) => Edge[];
}

interface ReactFlowWrapperProps {
  children: (components: ReactFlowComponents) => ReactNode;
}

export function ReactFlowWrapper({ children }: ReactFlowWrapperProps) {
  const [components, setComponents] = useState<ReactFlowComponents | null>(null);

  useEffect(() => {
    // Only import ReactFlow on the client side
    if (typeof window !== "undefined") {
      Promise.all([
        import("@xyflow/react"),
        import("@xyflow/react/dist/style.css"),
      ]).then(([reactFlowModule]) => {
        setComponents({
          ReactFlow: reactFlowModule.ReactFlow,
          ReactFlowProvider: reactFlowModule.ReactFlowProvider,
          Background: reactFlowModule.Background,
          Controls: reactFlowModule.Controls,
          MiniMap: reactFlowModule.MiniMap,
          useNodesState: reactFlowModule.useNodesState as <T extends Node = Node>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void],
          useEdgesState: reactFlowModule.useEdgesState as <T extends Edge = Edge>(initial: T[]) => [T[], React.Dispatch<React.SetStateAction<T[]>>, (changes: unknown) => void],
          addEdge: reactFlowModule.addEdge as (edgeParams: unknown, edges: Edge[]) => Edge[],
        });
      });
    }
  }, []);

  if (!components) {
    return (
      <div className="flex h-[calc(100vh-var(--header-height))] items-center justify-center">
        <p className="text-muted-foreground">Loading canvas...</p>
      </div>
    );
  }

  return <>{children(components)}</>;
}
