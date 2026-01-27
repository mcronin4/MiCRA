"use client";

import React from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Play, CheckCircle2 } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";

export function StartNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const isRunning = node?.status === "running";
  const isCompleted = node?.status === "completed";

  return (
    <div
      className={`
        relative
        bg-gradient-to-br from-emerald-50 to-emerald-100
        rounded-2xl
        shadow-[0_2px_12px_-4px_rgba(16,185,129,0.15)]
        border-2 border-emerald-300
        min-w-[140px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_30px_-8px_rgba(16,185,129,0.25)]
        hover:border-emerald-400
        hover:-translate-y-1
        ${isRunning ? "animate-pulse" : ""}
      `}
    >
      <div className="px-5 py-4 flex items-center gap-3">
        <div
          className={`
            p-2.5 rounded-xl 
            ${isCompleted ? "bg-emerald-500" : "bg-emerald-100"}
            shadow-sm ring-1 ring-inset ring-emerald-200/50
            transition-colors duration-300
          `}
        >
          {isCompleted ? (
            <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
          ) : (
            <Play
              size={20}
              className="text-emerald-600"
              strokeWidth={2.5}
              fill="currentColor"
            />
          )}
        </div>
        <div>
          <h3 className="font-bold text-[15px] text-emerald-900 leading-tight">
            Start
          </h3>
          <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">
            Workflow entry
          </p>
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="start-output"
        style={{
          background: "#10b981",
          width: 14,
          height: 14,
          border: "3px solid white",
          boxShadow: "0 2px 8px rgba(16,185,129,0.4)",
          right: -7,
        }}
        className="hover:scale-125 transition-transform"
      />
    </div>
  );
}
