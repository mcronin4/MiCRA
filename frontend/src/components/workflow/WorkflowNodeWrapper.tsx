"use client";

import React, { useState } from "react";
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
  Play,
  TextQuote,
} from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { NodeConfig } from "@/types/workflow";

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
  onExecute: () => Promise<void>;
  theme?: NodeTheme;
  children?: React.ReactNode;
}

// Tooltip component for handles
function HandleTooltip({
  label,
  type,
  dataType,
  visible,
  position,
}: {
  label: string;
  type: "input" | "output";
  dataType: string;
  visible: boolean;
  position: "left" | "right";
}) {
  if (!visible) return null;

  const positionClasses =
    position === "left" ? "right-full mr-3" : "left-full ml-3";

  return (
    <div
      className={`
        absolute ${positionClasses} top-1/2 -translate-y-1/2 z-50
        px-3 py-2 rounded-lg
        bg-white/90 backdrop-blur-md
        text-slate-700 text-xs font-medium
        shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)]
        border border-slate-100/50
        whitespace-nowrap
        animate-fade-in
        pointer-events-none
      `}
    >
      <div className="flex items-center gap-2">
        <span
          className={`
          w-1.5 h-1.5 rounded-full
          ${type === "input" ? "bg-indigo-500" : "bg-emerald-500"}
        `}
        />
        <span className="font-semibold tracking-tight">{label}</span>
        <span className="text-slate-400 text-[10px] uppercase tracking-wider font-medium">
          {dataType}
        </span>
      </div>
    </div>
  );
}

export function WorkflowNodeWrapper({
  nodeId,
  config,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onExecute,
  theme = nodeThemes.indigo,
  children,
}: Props) {
  const node = useWorkflowStore((state) => state.nodes[nodeId]);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);

  const statusConfig = {
    idle: { icon: null, color: "text-slate-400 bg-slate-100", text: "Ready" },
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

  return (
    <div
      className="
        group
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
      "
    >
      {/* Minimalist header */}
      <div className="px-6 py-5 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3.5">
            <div
              className={`
              p-2.5 rounded-xl ${theme.iconBg} ${theme.iconColor} 
              shadow-sm ring-1 ring-inset ring-black/5
            `}
            >
              <ThemeIcon size={20} />
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
          <div className="flex items-center gap-2">
            <button
              onClick={onExecute}
              disabled={node?.status === "running"}
              className={`
                nodrag inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide
                ${theme.accentColor} ${theme.accentHover} text-white
                transition-colors duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
              title="Test this node"
            >
              {node?.status === "running" ? (
                <Loader2 size={12} className="animate-spin" strokeWidth={2.5} />
              ) : (
                <Play size={12} strokeWidth={2.5} />
              )}
              Test
            </button>
            <div
              className={`
              flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase
              ${statusConfig.color}
              transition-colors duration-200
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
      </div>

      {/* Input handles with minimalist tooltips */}
      {config.inputs.map((input, idx) => (
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
              border: `3px solid ${theme.handleInput}`,
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              cursor: "crosshair",
            }}
            className="hover:scale-125 hover:border-[4px]"
          />
          <HandleTooltip
            label={input.label}
            type="input"
            dataType={input.type}
            visible={hoveredHandle === input.id}
            position="left"
          />
        </div>
      ))}

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
      {config.outputs.map((output, idx) => (
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
        >
          <Handle
            type="source"
            position={Position.Right}
            id={output.id}
            style={{
              background: "white",
              width: 12,
              height: 12,
              border: `3px solid ${theme.handleOutput}`,
              boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              cursor: "crosshair",
            }}
            className="hover:scale-125 hover:border-[4px]"
          />
          <HandleTooltip
            label={output.label}
            type="output"
            dataType={output.type}
            visible={hoveredHandle === output.id}
            position="right"
          />
        </div>
      ))}
    </div>
  );
}
