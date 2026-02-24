"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { NodeConfig } from "@/types/workflow";
import {
  getPresets,
  generateText,
  TextGenerationPreset,
  GenerateTextRequest,
} from "@/lib/fastapi/text-generation";
import { Plus, Settings } from "lucide-react";
import { PresetManager } from "./PresetManager";
import { useNodeConnections } from "@/hooks/useNodeConnections";

type PresetVariant = "summary" | "action_items" | null;

interface PresetOption {
  optionValue: string;
  presetId: string;
  label: string;
  variant: PresetVariant;
  preset: TextGenerationPreset;
}

const normalizePresetName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isSummaryActionComboPreset = (preset: TextGenerationPreset): boolean => {
  const normalized = normalizePresetName(preset.name);
  return normalized.includes("summary") && normalized.includes("action");
};

const findPreset = (
  presets: TextGenerationPreset[],
  predicate: (normalizedName: string) => boolean,
): TextGenerationPreset | undefined =>
  presets.find((preset) => predicate(normalizePresetName(preset.name)));

function buildPresetOptions(presets: TextGenerationPreset[]): PresetOption[] {
  const linkedinPreset = findPreset(
    presets,
    (name) => name.includes("linkedin post") || name.includes("linkedin"),
  );
  const xPreset = findPreset(
    presets,
    (name) =>
      name === "x" ||
      name === "x post" ||
      name.includes("x post") ||
      name.includes("twitter"),
  );
  const emailPreset = findPreset(presets, (name) => name.includes("email"));

  const summaryActionComboPreset = findPreset(
    presets,
    (name) => name.includes("summary") && name.includes("action"),
  );

  const summaryPreset =
    findPreset(
      presets,
      (name) => name.includes("summary") && !name.includes("action"),
    ) || summaryActionComboPreset;

  const actionItemsPreset =
    findPreset(
      presets,
      (name) =>
        (name.includes("action item") || name.includes("action items")) &&
        !name.includes("summary"),
    ) || summaryActionComboPreset;

  const options: PresetOption[] = [];

  if (linkedinPreset) {
    options.push({
      optionValue: linkedinPreset.id,
      presetId: linkedinPreset.id,
      label: "LinkedIn Post",
      variant: null,
      preset: linkedinPreset,
    });
  }

  if (xPreset) {
    options.push({
      optionValue: xPreset.id,
      presetId: xPreset.id,
      label: "X Post",
      variant: null,
      preset: xPreset,
    });
  }

  if (emailPreset) {
    options.push({
      optionValue: emailPreset.id,
      presetId: emailPreset.id,
      label: "Email",
      variant: null,
      preset: emailPreset,
    });
  }

  if (summaryPreset) {
    const summaryUsesCombo = isSummaryActionComboPreset(summaryPreset);
    const variant: PresetVariant = summaryUsesCombo ? "summary" : null;
    options.push({
      optionValue: variant
        ? `${summaryPreset.id}::${variant}`
        : summaryPreset.id,
      presetId: summaryPreset.id,
      label: "Summary",
      variant,
      preset: summaryPreset,
    });
  }

  if (actionItemsPreset) {
    const actionUsesCombo = isSummaryActionComboPreset(actionItemsPreset);
    const variant: PresetVariant = actionUsesCombo ? "action_items" : null;
    options.push({
      optionValue: variant
        ? `${actionItemsPreset.id}::${variant}`
        : actionItemsPreset.id,
      presetId: actionItemsPreset.id,
      label: "Action Items",
      variant,
      preset: actionItemsPreset,
    });
  }

  if (options.length === 0) {
    return presets.map((preset) => ({
      optionValue: preset.id,
      presetId: preset.id,
      label: preset.name,
      variant: null,
      preset,
    }));
  }

  return options;
}

function applyPresetVariantInput(
  input: string,
  variant: PresetVariant,
): string {
  if (variant === "summary") {
    return (
      "Task: Provide only a concise summary of the content. Do not include action items.\n\n" +
      `Source content:\n${input}`
    );
  }

  if (variant === "action_items") {
    return (
      "Task: Extract only actionable next steps as bullet points. Do not include a narrative summary.\n\n" +
      `Source content:\n${input}`
    );
  }

  return input;
}

// Config for this node type
const config: NodeConfig = {
  type: "text-generation",
  label: "Text Generation",
  description: "Generate text using customizable presets",
  inputs: [{ id: "text", label: "Text", type: "string" }],
  outputs: [{ id: "generated_text", label: "Generated Text", type: "string" }],
};

export function TextGenerationNode({ id }: NodeProps) {
  // Get the node from the Zustand state manager
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const { hasConnections } = useNodeConnections(id);

  // Determine if manual inputs should be shown
  // Only show manual inputs when test mode is enabled
  const showManualInputs = node?.manualInputEnabled ?? false;

  // Initial state from node inputs
  const initialText =
    typeof node?.inputs?.text === "string" ? node.inputs.text : "";
  const initialPresetId =
    typeof node?.inputs?.preset_id === "string" ? node.inputs.preset_id : "";
  const initialPresetVariant =
    typeof node?.inputs?.preset_variant === "string"
      ? node.inputs.preset_variant
      : "";

  const [text, setText] = useState<string>(initialText);
  const [presetOptions, setPresetOptions] = useState<PresetOption[]>([]);
  const [selectedPresetOptionValue, setSelectedPresetOptionValue] =
    useState<string>("");
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [editingPreset, setEditingPreset] =
    useState<TextGenerationPreset | null>(null);
  const [generatedOutput, setGeneratedOutput] = useState<Record<
    string,
    unknown
  > | null>(null);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      setGeneratedOutput(null);
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  const loadPresets = useCallback(async () => {
    try {
      setIsLoadingPresets(true);
      const loadedPresets = await getPresets();
      const curatedOptions = buildPresetOptions(loadedPresets);
      setPresetOptions(curatedOptions);
    } catch (error) {
      console.error("Failed to load presets:", error);
    } finally {
      setIsLoadingPresets(false);
    }
  }, []);

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Resolve the selected preset option from node inputs and available options.
  useEffect(() => {
    if (presetOptions.length === 0) {
      setSelectedPresetOptionValue("");
      return;
    }

    setSelectedPresetOptionValue((current) => {
      if (current && presetOptions.some((option) => option.optionValue === current)) {
        return current;
      }

      const byIdAndVariant = presetOptions.find(
        (option) =>
          option.presetId === initialPresetId &&
          (option.variant ?? "") === initialPresetVariant,
      );
      if (byIdAndVariant) return byIdAndVariant.optionValue;

      const byId = presetOptions.find(
        (option) => option.presetId === initialPresetId,
      );
      if (byId) return byId.optionValue;

      return presetOptions[0]?.optionValue ?? "";
    });
  }, [
    presetOptions,
    initialPresetId,
    initialPresetVariant,
  ]);

  const selectedPresetOption =
    presetOptions.find((option) => option.optionValue === selectedPresetOptionValue) ??
    null;
  const selectedPreset = selectedPresetOption?.preset ?? null;
  const selectedPresetId = selectedPresetOption?.presetId ?? "";
  const selectedPresetVariant = selectedPresetOption?.variant ?? null;
  const rawMaxLengthOverride = node?.inputs?.max_length_override;
  const toneGuidanceOverride =
    typeof node?.inputs?.tone_guidance_override === "string"
      ? node.inputs.tone_guidance_override
      : "";
  const maxLengthOverride =
    typeof rawMaxLengthOverride === "number" &&
    Number.isFinite(rawMaxLengthOverride)
      ? Math.floor(rawMaxLengthOverride)
      : null;
  const structureTemplateOverride =
    typeof node?.inputs?.structure_template_override === "string"
      ? node.inputs.structure_template_override
      : "";
  const promptTemplateOverride =
    typeof node?.inputs?.prompt_template_override === "string"
      ? node.inputs.prompt_template_override
      : "";
  const outputFormatOverride =
    node?.inputs?.output_format_override &&
    typeof node.inputs.output_format_override === "object" &&
    !Array.isArray(node.inputs.output_format_override)
      ? (node.inputs.output_format_override as Record<string, unknown>)
      : undefined;
  const effectivePresetForEditor = useMemo<TextGenerationPreset | null>(() => {
    if (!selectedPreset) return null;
    return {
      ...selectedPreset,
      tone_guidance: toneGuidanceOverride.trim() || selectedPreset.tone_guidance,
      max_length:
        typeof maxLengthOverride === "number"
          ? maxLengthOverride
          : selectedPreset.max_length,
      structure_template:
        structureTemplateOverride.trim() || selectedPreset.structure_template,
      prompt: promptTemplateOverride.trim() || selectedPreset.prompt,
      output_format: outputFormatOverride ?? selectedPreset.output_format,
    };
  }, [
    selectedPreset,
    toneGuidanceOverride,
    maxLengthOverride,
    structureTemplateOverride,
    promptTemplateOverride,
    outputFormatOverride,
  ]);

  // Sync inputs to Zustand store
  useEffect(() => {
    if (!node) return;

    if (presetOptions.length === 0 || !selectedPresetOption) {
      if (node.inputs.text !== text) {
        updateNode(id, {
          inputs: {
            ...node.inputs,
            text,
          },
        });
      }
      return;
    }

    const existingVariant =
      typeof node.inputs.preset_variant === "string"
        ? node.inputs.preset_variant
        : undefined;
    const nextVariant = selectedPresetVariant ?? undefined;

    if (
      node.inputs.text !== text ||
      node.inputs.preset_id !== selectedPresetId ||
      existingVariant !== nextVariant
    ) {
      const nextInputs: Record<string, unknown> = {
        ...node.inputs,
        text,
        preset_id: selectedPresetId,
      };

      if (selectedPresetVariant) {
        nextInputs.preset_variant = selectedPresetVariant;
      } else {
        delete nextInputs.preset_variant;
      }

      updateNode(id, {
        inputs: nextInputs,
      });
    }
  }, [
    text,
    selectedPresetId,
    selectedPresetVariant,
    presetOptions.length,
    selectedPresetOption,
    id,
    updateNode,
    node,
  ]);

  const handleCreatePreset = () => {
    setEditingPreset(null);
    setShowPresetManager(true);
  };

  const handleEditPreset = () => {
    if (!effectivePresetForEditor) return;
    setEditingPreset(effectivePresetForEditor);
    setShowPresetManager(true);
  };

  const handlePresetSaved = () => {
    setShowPresetManager(false);
    setEditingPreset(null);
    loadPresets(); // Reload presets after save
  };

  const handleExecute = async () => {
    if (!selectedPresetOption || !selectedPresetId) {
      updateNode(id, { status: "error", error: "Please select a preset" });
      return;
    }

    if (!text.trim()) {
      updateNode(id, { status: "error", error: "Please enter input text" });
      return;
    }

    updateNode(id, { status: "running", error: undefined });
    setGeneratedOutput(null);

    try {
      const request: GenerateTextRequest = {
        input_text: applyPresetVariantInput(text, selectedPresetVariant),
        preset_id: selectedPresetId,
      };
      if (toneGuidanceOverride.trim()) {
        request.tone_guidance_override = toneGuidanceOverride.trim();
      }
      if (typeof maxLengthOverride === "number" && maxLengthOverride > 0) {
        request.max_length_override = maxLengthOverride;
      }
      if (structureTemplateOverride.trim()) {
        request.structure_template_override = structureTemplateOverride.trim();
      }
      if (promptTemplateOverride.trim()) {
        request.prompt_template_override = promptTemplateOverride.trim();
      }
      if (outputFormatOverride) {
        request.output_format_override = outputFormatOverride;
      }

      const response = await generateText(request);

      if (!response.success) {
        throw new Error(response.error || "Generation failed");
      }

      setGeneratedOutput(response.output);

      // Update node with results
      updateNode(id, {
        status: "completed",
        outputs: { generated_text: response.output },
        inputs: {
          ...node?.inputs,
          text,
          preset_id: selectedPresetId,
          ...(selectedPresetVariant
            ? { preset_variant: selectedPresetVariant }
            : {}),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      updateNode(id, { status: "error", error: errorMessage });
    }
  };

  return (
    <>
      <WorkflowNodeWrapper
        nodeId={id}
        config={config}
        onExecute={handleExecute}
        theme={nodeThemes.emerald}
      >
        <div className="space-y-4">
          {/* Text input - only show in test mode */}
          {showManualInputs && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                Input Text
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter text to generate from..."
                className="nodrag w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all placeholder:text-slate-400"
                rows={4}
              />
            </div>
          )}

          {/* Preset selector - always show (it's a parameter) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                Preset
              </label>
              <button
                onClick={handleCreatePreset}
                className="nodrag flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                <Plus size={14} strokeWidth={2} />
                New
              </button>
            </div>
            {isLoadingPresets ? (
              <div className="text-xs text-slate-400 py-3">
                Loading presets...
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedPresetOptionValue}
                  onChange={(e) => setSelectedPresetOptionValue(e.target.value)}
                  className="nodrag flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 transition-all"
                >
                  <option value="">Select a preset...</option>
                  {presetOptions.map((option) => (
                    <option key={option.optionValue} value={option.optionValue}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {selectedPreset && (
                  <button
                    onClick={handleEditPreset}
                    className="nodrag px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                    title="Edit preset"
                  >
                    <Settings size={16} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Preset info */}
          {selectedPreset && (
            <div className="text-xs text-gray-500 space-y-1">
              {(typeof maxLengthOverride === "number" ? maxLengthOverride : selectedPreset.max_length) && (
                <div>
                  Max length: {typeof maxLengthOverride === "number" ? maxLengthOverride : selectedPreset.max_length} characters
                </div>
              )}
              {(toneGuidanceOverride.trim() || selectedPreset.tone_guidance) && (
                <div>
                  Tone: {toneGuidanceOverride.trim() || selectedPreset.tone_guidance}
                </div>
              )}
              {structureTemplateOverride.trim() && (
                <div>
                  Structure: {structureTemplateOverride}
                </div>
              )}
            </div>
          )}

          {/* Test Node button - show when test mode is enabled */}
          {node?.manualInputEnabled && (
            <button
              onClick={handleExecute}
              disabled={node?.status === "running" || !selectedPresetId || !text.trim()}
              className={`
                nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
                transition-all duration-200
                ${
                  node?.status === "running" || !selectedPresetId || !text.trim()
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg"
                }
              `}
            >
              {node?.status === "running" ? "Running..." : "Test Node"}
            </button>
          )}

          {/* Generated output display */}
          {generatedOutput && node?.status === "completed" && (
            <div className="mt-3 p-2 bg-gray-50 border rounded text-xs">
              <div className="font-semibold mb-1">Generated Output:</div>
              <pre className="whitespace-pre-wrap text-xs">
                {JSON.stringify(generatedOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </WorkflowNodeWrapper>

      {/* Preset Manager Modal */}
      {showPresetManager && (
        <PresetManager
          preset={editingPreset}
          onSave={handlePresetSaved}
          onCancel={() => {
            setShowPresetManager(false);
            setEditingPreset(null);
          }}
        />
      )}
    </>
  );
}
