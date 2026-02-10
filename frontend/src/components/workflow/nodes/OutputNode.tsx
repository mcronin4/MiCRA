"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { NodeConfig } from "@/types/workflow";
import { Send } from "lucide-react";
import { useNodeConnections } from "@/hooks/useNodeConnections";

const OUTPUT_TYPES = [
  { value: "linkedin", label: "LinkedIn Post" },
  { value: "tiktok", label: "TikTok Video" },
  { value: "email", label: "Email" },
] as const;

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "concise", label: "Concise" },
  { value: "persuasive", label: "Persuasive" },
] as const;

const config: NodeConfig = {
  type: "Output",
  label: "Output",
  description: "Generate content for a platform",
  inputs: [{ id: "text", label: "Text", type: "string" }],
  outputs: [{ id: "generated_content", label: "Generated Content", type: "string" }],
};

// Extend the indigo theme with the Send icon
const outputTheme = {
  ...nodeThemes.indigo,
  icon: Send,
};

export function OutputNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const { hasConnections } = useNodeConnections(id);

  const showManualInputs = node?.manualInputEnabled ?? false;

  const initialOutputType =
    typeof node?.inputs?.output_type === "string" ? node.inputs.output_type : "linkedin";
  const initialTone =
    typeof node?.inputs?.tone === "string" ? node.inputs.tone : "professional";
  const initialText =
    typeof node?.inputs?.text === "string" ? node.inputs.text : "";

  const [outputType, setOutputType] = useState(initialOutputType);
  const [tone, setTone] = useState(initialTone);
  const [text, setText] = useState(initialText);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  // Sync params to Zustand store
  useEffect(() => {
    if (
      node &&
      (node.inputs.output_type !== outputType ||
        node.inputs.tone !== tone ||
        node.inputs.text !== text)
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          output_type: outputType,
          tone: tone,
          text: text,
        },
      });
    }
  }, [outputType, tone, text, id, updateNode, node]);

  const handleExecute = async () => {
    // Test mode execution is handled by the workflow executor
    // This is a placeholder for the wrapper's onExecute prop
    updateNode(id, { status: "running", error: undefined });
  };

  const generatedContent =
    node?.status === "completed" && node?.outputs?.generated_content
      ? String(node.outputs.generated_content)
      : null;

  return (
    <WorkflowNodeWrapper
      nodeId={id}
      config={config}
      onExecute={handleExecute}
      theme={outputTheme}
    >
      <div className="space-y-4">
        {/* Manual text input - only show in test mode */}
        {showManualInputs && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Input Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter source text..."
              className="nodrag w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400"
              rows={3}
            />
          </div>
        )}

        {/* Output type selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Output Type
          </label>
          <select
            value={outputType}
            onChange={(e) => setOutputType(e.target.value)}
            className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          >
            {OUTPUT_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tone selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Tone
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
          >
            {TONE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Generated content preview */}
        {generatedContent && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Generated Content
            </label>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 max-h-40 overflow-auto whitespace-pre-wrap">
              {generatedContent}
            </div>
          </div>
        )}
      </div>
    </WorkflowNodeWrapper>
  );
}
