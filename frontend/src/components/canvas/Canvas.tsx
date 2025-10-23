"use client";

import {
  Bot,
  ChevronLeft,
  ChevronRight,
  FileText,
  GripVertical,
  Layers,
  Mail,
  Settings2,
  Share2,
  Sparkles,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button"; // Assuming you have a Button component
import type { Edge, Node, NodeTypes, OnConnect } from "@xyflow/react";
import { ReactFlowWrapper } from "./ReactFlowWrapper";
import { LinkedInNode } from "./LinkedInNode";
import { EmailNode } from "./EmailNode";
import { TikTokNode } from "./TikTokNode";

const nodeTypes: NodeTypes = {
  linkedIn: LinkedInNode,
  email: EmailNode,
  tiktok: TikTokNode,
};

function CanvasContent() {
  return (
    <ReactFlowWrapper>
      {({
        ReactFlow,
        ReactFlowProvider,
        Background,
        Controls,
        MiniMap,
        useNodesState,
        useEdgesState,
        addEdge,
      }) => (
        <InnerCanvas
          ReactFlow={ReactFlow}
          ReactFlowProvider={ReactFlowProvider}
          Background={Background}
          Controls={Controls}
          MiniMap={MiniMap}
          useNodesState={useNodesState}
          useEdgesState={useEdgesState}
          addEdge={addEdge}
        />
      )}
    </ReactFlowWrapper>
  );
}

function InnerCanvas({
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
}: {
  ReactFlow: any;
  ReactFlowProvider: any;
  Background: any;
  Controls: any;
  MiniMap: any;
  useNodesState: any;
  useEdgesState: any;
  addEdge: any;
}) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges, addEdge]
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");

      if (typeof type === "undefined" || !type || !reactFlowInstance) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label: `${type} node` },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  return (
    <ReactFlowProvider>
      <div className="flex h-[calc(100vh-65px)]">
        <aside
          className={`${
            isSidebarCollapsed ? "w-20" : "w-72"
          } bg-background border-r transition-all duration-300 flex flex-col`}
        >
          <div
            className={`flex-1 ${
              isSidebarCollapsed ? "p-3" : "p-6"
            } overflow-y-auto`}
          >
            <div
              className={`flex items-center ${
                isSidebarCollapsed ? "justify-center mb-6" : "justify-between mb-8"
              }`}
            >
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">AI Agents</h2>
                    <p className="text-xs text-muted-foreground">
                      Drag to canvas
                    </p>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`h-9 w-9 hover:bg-primary/10 ${
                  isSidebarCollapsed ? "" : "ml-auto"
                }`}
              >
                {isSidebarCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>

            <div className="space-y-3">
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Content Agents
                  </span>
                </div>
              )}

              <DraggableNode
                type="linkedIn"
                label={isSidebarCollapsed ? "" : "LinkedIn Post"}
                description={
                  isSidebarCollapsed ? "" : "Generate a LinkedIn post"
                }
                icon={<FileText className="h-5 w-5" />}
                collapsed={isSidebarCollapsed}
                color="blue"
              />
              <DraggableNode
                type="email"
                label={isSidebarCollapsed ? "" : "Email Draft"}
                description={isSidebarCollapsed ? "" : "Draft an email"}
                icon={<Mail className="h-5 w-5" />}
                collapsed={isSidebarCollapsed}
                color="green"
              />
              <DraggableNode
                type="tiktok"
                label={isSidebarCollapsed ? "" : "TikTok Script"}
                description={isSidebarCollapsed ? "" : "Create a TikTok script"}
                icon={<FileText className="h-5 w-5" />}
                collapsed={isSidebarCollapsed}
                color="purple"
              />
            </div>
          </div>
        </aside>

        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background variant="dots" gap={16} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function DraggableNode({
  type,
  label,
  description,
  icon,
  collapsed,
  color = "blue",
}: {
  type: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  collapsed?: boolean;
  color?: "blue" | "green" | "purple" | "yellow";
}) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData("application/reactflow", type);
    event.dataTransfer.effectAllowed = "move";
  };

  const colorClasses = {
    blue: "from-blue-500/20 to-blue-600/20 hover:from-blue-500/30 hover:to-blue-600/30 border-blue-500/30 text-blue-500",
    green: "from-green-500/20 to-green-600/20 hover:from-green-500/30 hover:to-green-600/30 border-green-500/30 text-green-500",
    purple: "from-purple-500/20 to-purple-600/20 hover:from-purple-500/30 hover:to-purple-600/30 border-purple-500/30 text-purple-500",
    yellow: "from-yellow-500/20 to-yellow-600/20 hover:from-yellow-500/30 hover:to-yellow-600/30 border-yellow-500/30 text-yellow-500",
  };

  if (collapsed) {
    return (
      <div
        className={`cursor-move rounded-xl bg-gradient-to-br ${colorClasses[color]} border backdrop-blur-sm p-3 transition-all hover:scale-105 hover:shadow-lg flex items-center justify-center group`}
        onDragStart={onDragStart}
        draggable
        title={label}
        style={{ opacity: 1 }}
      >
        <div className="text-foreground">{icon}</div>
      </div>
    );
  }

  return (
    <div
      className={`cursor-move rounded-xl bg-gradient-to-br ${colorClasses[color]} border backdrop-blur-sm p-4 transition-all hover:scale-[1.02] hover:shadow-lg group`}
      onDragStart={onDragStart}
      draggable
      style={{ opacity: 1 }}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="text-foreground">{icon}</div>
          <div className="flex-1">
            <h3 className="font-medium text-foreground">{label}</h3>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          <GripVertical className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function Canvas() {
  return <CanvasContent />;
}

export default Canvas;
