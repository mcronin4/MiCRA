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
import { useCallback, useEffect, useRef, useState, type DragEvent, MouseEvent } from "react";
import { Button } from "@/components/ui/button"; // Assuming you have a Button component
import type { Edge, Node, NodeTypes, OnConnect, Viewport } from "@xyflow/react";
import { ReactFlowWrapper } from "./ReactFlowWrapper";
import { LinkedInNode } from "./LinkedInNode";
import { EmailNode } from "./EmailNode";
import { TikTokNode } from "./TikTokNode";
import ZoomControls from "../ZoomControls";
import AddPartMenu from "../AddPartMenu";
import PartContextMenu from "../PartContextMenu";

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
  const [isLocked, setIsLocked] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [addMenu, setAddMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds: Edge[]) => addEdge(params, eds)),
    [setEdges, addEdge]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      setContextMenu(null);
      setAddMenu({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [setAddMenu]
  );

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      event.preventDefault();
      setAddMenu(null);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeId: node.id,
      });
    },
    [setContextMenu]
  );

  const onPaneClick = useCallback(() => {
    setAddMenu(null);
    setContextMenu(null);
  }, []);

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

      setNodes((nds: Node[]) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const addNode = (type: string) => {
    if (!addMenu) return;
    const position = reactFlowInstance.screenToFlowPosition({
      x: addMenu.x,
      y: addMenu.y,
    });
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: { label: `${type} node` },
    };
    setNodes((nds: Node[]) => nds.concat(newNode));
  };

  const deleteNode = () => {
    if (!contextMenu) return;
    setNodes((nds: Node[]) => nds.filter((n: Node) => n.id !== contextMenu.nodeId));
  };

  const duplicateNode = () => {
    if (!contextMenu) return;
    const nodeToDuplicate = nodes.find((n: Node) => n.id === contextMenu.nodeId);
    if (!nodeToDuplicate) return;
    const newNode: Node = {
      ...nodeToDuplicate,
      id: `${nodeToDuplicate.type}-${Date.now()}`,
      position: {
        x: nodeToDuplicate.position.x + 20,
        y: nodeToDuplicate.position.y + 20,
      },
    };
    setNodes((nds: Node[]) => nds.concat(newNode));
  };

  const copyNode = () => {
    if (!contextMenu) return;
    const nodeToCopy = nodes.find((n: Node) => n.id === contextMenu.nodeId);
    if (!nodeToCopy) return;
    navigator.clipboard.writeText(JSON.stringify(nodeToCopy));
  };

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
            proOptions={{ hideAttribution: true }}
            onMove={(_: any, viewport: Viewport) => setZoom(viewport.zoom)}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
          >
            <Background variant="dots" gap={16} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>
          <ZoomControls
            scale={zoom}
            onZoomIn={() => reactFlowInstance?.zoomIn()}
            onZoomOut={() => reactFlowInstance?.zoomOut()}
            onFitView={() => reactFlowInstance?.fitView()}
            onToggleLock={() => setIsLocked(!isLocked)}
            isLocked={isLocked}
          />
          {addMenu && (
            <AddPartMenu
              position={addMenu}
              onAddPart={addNode}
              onClose={() => setAddMenu(null)}
            />
          )}
          {contextMenu && (
            <PartContextMenu
              position={contextMenu}
              onDelete={deleteNode}
              onDuplicate={duplicateNode}
              onCopy={copyNode}
              onClose={() => setContextMenu(null)}
            />
          )}
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
    blue: "bg-blue-100 hover:bg-blue-200 text-blue-800",
    green: "bg-green-100 hover:bg-green-200 text-green-800",
    purple: "bg-purple-100 hover:bg-purple-200 text-purple-800",
    yellow: "bg-yellow-100 hover:bg-yellow-200 text-yellow-800",
  };

  if (collapsed) {
    return (
      <div
        className={`cursor-move rounded-lg p-3 transition-colors flex items-center justify-center group ${colorClasses[color]}`}
        onDragStart={onDragStart}
        draggable
        title={label}
      >
        <div className="text-foreground">{icon}</div>
      </div>
    );
  }

  return (
    <div
      className={`cursor-move rounded-lg p-4 transition-colors group ${colorClasses[color]}`}
      onDragStart={onDragStart}
      draggable
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
