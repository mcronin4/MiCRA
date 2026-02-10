"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Flag, Loader2, CheckCircle2, XCircle, Eye } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";

export function EndNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const currentWorkflowId = useWorkflowStore((state) => state.currentWorkflowId);
  const status = node?.status || "idle";
  const router = useRouter();

  const statusConfig = {
    idle: {
      icon: Flag,
      bgClass: "from-rose-50 to-rose-100",
      borderClass: "border-rose-300",
      iconBgClass: "bg-rose-100",
      iconClass: "text-rose-600",
      label: "Waiting",
    },
    pending: {
      icon: Flag,
      bgClass: "from-amber-50 to-amber-100",
      borderClass: "border-amber-300",
      iconBgClass: "bg-amber-100",
      iconClass: "text-amber-600",
      label: "Ready",
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

      {/* View Results button when completed */}
      {status === "completed" && currentWorkflowId && (
        <div className="px-5 pb-4">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/preview/${currentWorkflowId}`);
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-white/80 hover:bg-white text-emerald-700 hover:text-emerald-800 font-medium text-sm shadow-sm border border-emerald-200/80 transition-colors"
          >
            <Eye size={14} />
            View Results
          </button>
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
