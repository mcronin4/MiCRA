"use client";

import React from "react";
import { FlaskConical } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";

interface ManualInputToggleProps {
  nodeId: string;
}

export function ManualInputToggle({
  nodeId,
}: ManualInputToggleProps) {
  const node = useWorkflowStore((state) => state.nodes[nodeId]);
  const updateNode = useWorkflowStore((state) => state.updateNode);

  const isEnabled = node?.manualInputEnabled ?? false;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(nodeId, {
      manualInputEnabled: !isEnabled,
    });
  };

  return (
    <button
      onClick={handleToggle}
      className={`
        absolute bottom-3 right-3 z-20
        flex items-center gap-1.5
        px-2.5 py-1.5 rounded-lg
        transition-all duration-200
        nodrag
        border-2
        ${
          isEnabled
            ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-lg ring-2 ring-amber-200"
            : "bg-white text-slate-500 border-slate-300 hover:border-slate-400 hover:bg-slate-50 shadow-sm"
        }
      `}
      title={isEnabled ? "Disable test mode" : "Enable test mode (manual input)"}
      aria-label={isEnabled ? "Disable test mode" : "Enable test mode"}
    >
      <FlaskConical size={14} strokeWidth={2.5} />
      <span className="text-xs font-semibold">Test</span>
    </button>
  );
}

