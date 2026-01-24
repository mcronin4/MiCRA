"use client";

import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Flag, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";

export function EndNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const status = node?.status || "idle";

  const statusConfig = {
    idle: {
      icon: Flag,
      bgClass: "from-rose-50 to-rose-100",
      borderClass: "border-rose-300",
      iconBgClass: "bg-rose-100",
      iconClass: "text-rose-600",
      label: "Waiting",
    },
    running: {
      icon: Loader2,
      bgClass: "from-blue-50 to-blue-100",
      borderClass: "border-blue-300",
      iconBgClass: "bg-blue-100",
      iconClass: "text-blue-600 animate-spin",
      label: "Running",
    },
    completed: {
      icon: CheckCircle2,
      bgClass: "from-emerald-50 to-emerald-100",
      borderClass: "border-emerald-300",
      iconBgClass: "bg-emerald-500",
      iconClass: "text-white",
      label: "Complete",
    },
    error: {
      icon: XCircle,
      bgClass: "from-red-50 to-red-100",
      borderClass: "border-red-300",
      iconBgClass: "bg-red-500",
      iconClass: "text-white",
      label: "Error",
    },
  }[status];

  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={`
        relative
        bg-gradient-to-br ${statusConfig.bgClass}
        rounded-2xl
        shadow-[0_2px_12px_-4px_rgba(244,63,94,0.15)]
        border-2 ${statusConfig.borderClass}
        min-w-[140px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_30px_-8px_rgba(244,63,94,0.25)]
        hover:-translate-y-1
      `}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="end-input"
        style={{
          background: "#f43f5e",
          width: 14,
          height: 14,
          border: "3px solid white",
          boxShadow: "0 2px 8px rgba(244,63,94,0.4)",
          left: -7,
        }}
        className="hover:scale-125 transition-transform"
      />

      <div className="px-5 py-4 flex items-center gap-3">
        <div
          className={`
            p-2.5 rounded-xl ${statusConfig.iconBgClass}
            shadow-sm ring-1 ring-inset ring-rose-200/50
            transition-colors duration-300
          `}
        >
          <StatusIcon
            size={20}
            className={statusConfig.iconClass}
            strokeWidth={2.5}
          />
        </div>
        <div>
          <h3 className="font-bold text-[15px] text-rose-900 leading-tight">
            End
          </h3>
          <p className="text-[11px] text-rose-600 mt-0.5 font-medium">
            {statusConfig.label}
          </p>
        </div>
      </div>

      {/* Show outputs if completed */}
      {status === "completed" && node?.outputs && (
        <div className="px-5 pb-4">
          <div className="bg-white/60 rounded-lg p-3 text-xs text-slate-600 max-h-32 overflow-auto">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(node.outputs, null, 2).slice(0, 200)}
              {JSON.stringify(node.outputs).length > 200 && "..."}
            </pre>
          </div>
        </div>
      )}

      {/* Show error if failed */}
      {status === "error" && node?.error && (
        <div className="px-5 pb-4">
          <div className="bg-red-100/60 rounded-lg p-3 text-xs text-red-700 font-medium">
            {node.error}
          </div>
        </div>
      )}
    </div>
  );
}
