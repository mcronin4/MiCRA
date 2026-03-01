"use client";

import React, { useState, useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  CheckCircle2,
  XCircle,
  Sparkles,
  Type,
  Images,
  Loader2,
  Film,
  Mic,
  TextQuote,
} from "lucide-react";
import { useWorkflowStore, NodeStatus } from "@/lib/stores/workflowStore";
import { NodeConfig } from "@/types/workflow";
import { ManualInputToggle } from "./nodes/ManualInputToggle";
import { getNodeSpec } from "@/lib/nodeRegistry";
import type { RuntimeType } from "@/types/blueprint";

// Minimalist Apple-inspired theme configurations
export interface NodeTheme {
  id: "indigo" | "emerald" | "amber" | "sky" | "teal" | "rose";
  // Header - minimal/white
  iconColor: string;
  iconBg: string;
  // Accent colors for interactive elements
  accentColor: string;
  accentHover: string;
  accentRing: string;
  // Handle colors
  handleInput: string;
  handleOutput: string;
  // Icon component
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const nodeThemes: Record<string, NodeTheme> = {
  indigo: {
    id: "indigo",
    iconColor: "text-indigo-600",
    iconBg: "bg-indigo-50",
    accentColor: "bg-indigo-600",
    accentHover: "hover:bg-indigo-700",
    accentRing: "focus:ring-indigo-500/30",
    handleInput: "#6366f1",
    handleOutput: "#818cf8",
    icon: Sparkles,
  },
  emerald: {
    id: "emerald",
    iconColor: "text-emerald-600",
    iconBg: "bg-emerald-50",
    accentColor: "bg-emerald-600",
    accentHover: "hover:bg-emerald-700",
    accentRing: "focus:ring-emerald-500/30",
    handleInput: "#10b981",
    handleOutput: "#34d399",
    icon: Type,
  },
  amber: {
    id: "amber",
    iconColor: "text-amber-600",
    iconBg: "bg-amber-50",
    accentColor: "bg-amber-600",
    accentHover: "hover:bg-amber-700",
    accentRing: "focus:ring-amber-500/30",
    handleInput: "#f59e0b",
    handleOutput: "#fbbf24",
    icon: Images,
  },
  sky: {
    id: "sky",
    iconColor: "text-sky-600",
    iconBg: "bg-sky-50",
    accentColor: "bg-sky-600",
    accentHover: "hover:bg-sky-700",
    accentRing: "focus:ring-sky-500/30",
    handleInput: "#38bdf8",
    handleOutput: "#7dd3fc",
    icon: Film,
  },
  teal: {
    id: "teal",
    iconColor: "text-teal-600",
    iconBg: "bg-teal-50",
    accentColor: "bg-teal-600",
    accentHover: "hover:bg-teal-700",
    accentRing: "focus:ring-teal-500/30",
    handleInput: "#14b8a6",
    handleOutput: "#5eead4",
    icon: Mic,
  },
  rose: {
    id: "rose",
    iconColor: "text-rose-600",
    iconBg: "bg-rose-50",
    accentColor: "bg-rose-600",
    accentHover: "hover:bg-rose-700",
    accentRing: "focus:ring-rose-500/30",
    handleInput: "#fb7185",
    handleOutput: "#fda4af",
    icon: TextQuote,
  },
};

interface Props {
  nodeId: string;
  config: NodeConfig;
  // Execution is triggered via per-node "Test Node" buttons inside nodes
  // (shown only when test mode is enabled).
  onExecute: () => Promise<void>;
  theme?: NodeTheme;
  children?: React.ReactNode;
  getOutputLabel?: (outputId: string, defaultLabel: string) => string;
  getOutputDataType?: (outputId: string, defaultDataType: string) => string;
  onOutputHandleDoubleClick?: (outputId: string) => void;
}

// Tooltip component for handles
function HandleTooltip({
  label,
  runtimeType,
  visible,
  position,
}: {
  label: string;
  runtimeType: RuntimeType | null;
  visible: boolean;
  position: "left" | "right";
}) {
  if (!visible) return null;

  const positionClasses =
    position === "left" ? "right-full mr-3" : "left-full ml-3";
  const theme = HANDLE_TOOLTIP_THEMES[runtimeType ?? "default"];

  return (
    <div
      className={`
        absolute ${positionClasses} top-1/2 -translate-y-1/2 z-50
        px-3.5 py-1.5 rounded-full border
        text-xs font-bold tracking-tight
        shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]
        whitespace-nowrap
        animate-fade-in
        pointer-events-none
        ${theme.pillClass}
        ${theme.textClass}
      `}
    >
      <span>{label}</span>
    </div>
  );
}

// Color mapping for data types (matches edge colors)
const DATA_TYPE_COLORS: Record<RuntimeType, string> = {
  Text: '#22c55e', // green-500
  ImageRef: '#3b82f6', // blue-500
  AudioRef: '#a855f7', // purple-500
  VideoRef: '#eab308', // yellow-500
};

const HANDLE_TOOLTIP_THEMES: Record<
  RuntimeType | "default",
  { pillClass: string; textClass: string }
> = {
  Text: {
    pillClass: "bg-gradient-to-br from-green-50 to-green-100 border-green-200/90",
    textClass: "text-green-900",
  },
  ImageRef: {
    pillClass: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200/90",
    textClass: "text-blue-900",
  },
  AudioRef: {
    pillClass: "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200/90",
    textClass: "text-purple-900",
  },
  VideoRef: {
    pillClass: "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200/90",
    textClass: "text-amber-900",
  },
  default: {
    pillClass: "bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200/90",
    textClass: "text-slate-800",
  },
};

// Map NodePort type to RuntimeType
function getRuntimeTypeFromPortType(portType: string, portId: string, nodeType: string, isInput: boolean): RuntimeType | null {
  // First try to get from node registry
  const nodeSpec = getNodeSpec(nodeType);
  if (nodeSpec) {
    const ports = isInput ? nodeSpec.inputs : nodeSpec.outputs;
    const port = ports.find(p => p.key === portId);
    if (port) {
      return port.runtime_type;
    }
  }
  
  // Fallback mapping from NodePort type to RuntimeType
  const typeMap: Record<string, RuntimeType> = {
    'string': 'Text',
    'text': 'Text',
    'image': 'ImageRef',
    'file': 'ImageRef',
    'image[]': 'ImageRef',
    // Legacy fallback: treat json-like ports as text to keep primitive-only handles.
    'json': 'Text',
    'audio': 'AudioRef',
    'video': 'VideoRef',
  };
  
  return typeMap[portType.toLowerCase()] || null;
}

// Get handle color based on data type
function getHandleColor(runtimeType: RuntimeType | null): string {
  if (runtimeType && DATA_TYPE_COLORS[runtimeType]) {
    return DATA_TYPE_COLORS[runtimeType];
  }
  return '#94a3b8'; // default gray
}

export function WorkflowNodeWrapper({
  nodeId,
  config,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onExecute,
  theme = nodeThemes.indigo,
  children,
  getOutputLabel,
  getOutputDataType,
  onOutputHandleDoubleClick,
}: Props) {
  const node = useWorkflowStore((state) => state.nodes[nodeId]);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  
  // Track previous status for animations
  const prevStatusRef = useRef<NodeStatus | undefined>(undefined);
  const [justCompleted, setJustCompleted] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // Detect status changes for animations
  useEffect(() => {
    const currentStatus = node?.status;
    const prevStatus = prevStatusRef.current;
    
    // Track running state for glow animation - MUST be set before early returns
    setIsRunning(currentStatus === 'running');
    
    // Update previous status
    prevStatusRef.current = currentStatus;
    
    // Trigger completion animation when status changes to completed
    if (currentStatus === 'completed' && prevStatus !== 'completed' && prevStatus !== undefined) {
      setJustCompleted(true);
      // Reset after animation completes
      const timer = setTimeout(() => setJustCompleted(false), 600);
      return () => clearTimeout(timer);
    }
  }, [node?.status]);

  const statusConfig = {
    idle: { icon: null, color: "text-slate-400 bg-slate-100", text: "Idle" },
    pending: { icon: null, color: "text-amber-600 bg-amber-50", text: "Ready" },
    running: {
      icon: Loader2,
      color: "text-blue-500 bg-blue-50",
      text: "Running",
    },
    completed: {
      icon: CheckCircle2,
      color: "text-emerald-500 bg-emerald-50",
      text: "Done",
    },
    error: { icon: XCircle, color: "text-red-500 bg-red-50", text: "Error" },
  }[node?.status || "idle"];

  const StatusIcon = statusConfig.icon;
  const ThemeIcon = theme.icon;
  const isCompleted = node?.status === "completed";

  return (
    <div
      className={`
        group
        relative
        bg-white
        rounded-2xl 
        shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)]
        border border-slate-200/60
        min-w-[340px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)]
        hover:border-slate-300/80
        hover:-translate-y-1
        ${justCompleted ? 'animate-node-complete' : ''}
        ${isRunning ? 'animate-running-glow border-blue-300' : ''}
      `}
    >
      {/* Minimalist header */}
      <div className="px-6 py-5 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={`
              p-2.5 rounded-xl 
              ${isCompleted ? 'bg-emerald-500' : theme.iconBg}
              ${isCompleted ? 'text-white' : theme.iconColor}
              shadow-sm ring-1 ring-inset ring-black/5
              transition-all duration-300
              ${isCompleted ? 'scale-105' : ''}
            `}
            >
              {isCompleted ? (
                <CheckCircle2 size={20} strokeWidth={2.5} />
              ) : (
                <ThemeIcon size={20} />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-[16px] text-slate-900 leading-tight">
                {config.label}
              </h3>
              {config.description && (
                <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
                  {config.description}
                </p>
              )}
            </div>
          </div>
          <div
            className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase
              ${statusConfig.color}
              transition-colors duration-200
              ${justCompleted ? 'animate-status-ripple' : ''}
            `}
          >
            {StatusIcon && (
              <StatusIcon
                size={12}
                className={node?.status === "running" ? "animate-spin" : ""}
                strokeWidth={2.5}
              />
            )}
            <span>{statusConfig.text}</span>
          </div>
        </div>
      </div>

      {/* Input handles with minimalist tooltips */}
      {config.inputs.map((input, idx) => {
        const runtimeType = getRuntimeTypeFromPortType(
          input.type,
          input.id,
          node?.type || config.type,
          true,
        );
        const handleColor = getHandleColor(runtimeType);
        return (
          <div
            key={input.id}
            className="absolute"
            style={{
              left: -6,
              top: `${((idx + 1) / (config.inputs.length + 1)) * 100}%`,
              transform: "translateY(-50%)",
            }}
            onMouseEnter={() => setHoveredHandle(input.id)}
            onMouseLeave={() => setHoveredHandle(null)}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              style={{
                background: "white",
                width: 12,
                height: 12,
                border: `3px solid ${handleColor}`,
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "crosshair",
              }}
              className="hover:scale-125 hover:border-[4px]"
            />
            <HandleTooltip
              label={input.label}
              runtimeType={runtimeType}
              visible={hoveredHandle === input.id}
              position="left"
            />
          </div>
        );
      })}

      {/* Manual Input Toggle - positioned relative to wrapper */}
      <ManualInputToggle nodeId={nodeId} />

      {/* Content */}
      <div className="p-6 pt-2">
        {children}

        {node?.error && (
          <div className="mt-4 p-3 bg-red-50/50 border border-red-100 rounded-xl text-xs text-red-600 font-medium flex items-start gap-2">
            <XCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{node.error}</span>
          </div>
        )}
      </div>

      {/* Output handles with minimalist tooltips */}
      {config.outputs.map((output, idx) => {
        const resolvedLabel = getOutputLabel ? getOutputLabel(output.id, output.label) : output.label;
        const resolvedDataType = getOutputDataType ? getOutputDataType(output.id, output.type) : output.type;
        const runtimeType = getRuntimeTypeFromPortType(
          resolvedDataType,
          output.id,
          node?.type || config.type,
          false,
        );
        const handleColor = getHandleColor(runtimeType);
        return (
          <div
            key={output.id}
            className="absolute"
            style={{
              right: -6,
              top: `${((idx + 1) / (config.outputs.length + 1)) * 100}%`,
              transform: "translateY(-50%)",
            }}
            onMouseEnter={() => setHoveredHandle(output.id)}
            onMouseLeave={() => setHoveredHandle(null)}
            onDoubleClick={(event) => {
              if (!onOutputHandleDoubleClick) return;
              event.preventDefault();
              event.stopPropagation();
              onOutputHandleDoubleClick(output.id);
            }}
          >
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              style={{
                background: "white",
                width: 12,
                height: 12,
                border: `3px solid ${handleColor}`,
                boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                cursor: "crosshair",
              }}
              className="hover:scale-125 hover:border-[4px]"
            />
            <HandleTooltip
              label={resolvedLabel}
              runtimeType={runtimeType}
              visible={hoveredHandle === output.id}
              position="right"
            />
          </div>
        );
      })}
    </div>
  );
}
