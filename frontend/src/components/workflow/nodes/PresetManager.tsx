"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  createPreset,
  updatePreset,
  TextGenerationPreset,
  CreatePresetRequest,
  UpdatePresetRequest,
} from "@/lib/fastapi/text-generation";
import { X, Save, Type, AlertCircle } from "lucide-react";

interface PresetManagerProps {
  preset: TextGenerationPreset | null;
  onSave: () => void;
  onCancel: () => void;
}

export function PresetManager({
  preset,
  onSave,
  onCancel,
}: PresetManagerProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxLength, setMaxLength] = useState<number | "">("");
  const [toneGuidance, setToneGuidance] = useState("");
  const [structureTemplate, setStructureTemplate] = useState("");
  const [outputLimit, setOutputLimit] = useState<number | "">("");
  const [outputFormatJson, setOutputFormatJson] = useState("{}");
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for portal container
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize form with preset data if editing
  useEffect(() => {
    if (preset) {
      setName(preset.name);
      setPrompt(preset.prompt);
      setMaxLength(preset.max_length || "");
      setToneGuidance(preset.tone_guidance || "");
      setStructureTemplate(preset.structure_template || "");
      setOutputLimit(preset.output_limit || "");
      setOutputFormatJson(JSON.stringify(preset.output_format || {}, null, 2));
      setIsDefault(preset.is_default || false);
    } else {
      // Reset form for new preset
      setName("");
      setPrompt("");
      setMaxLength("");
      setToneGuidance("");
      setStructureTemplate("");
      setOutputLimit("");
      setOutputFormatJson("{}");
      setIsDefault(false);
    }
  }, [preset]);

  const validateOutputFormat = (): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(outputFormatJson);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        setError("Output format must be a JSON object");
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      setError("Invalid JSON format");
      return null;
    }
  };

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!prompt.trim()) {
      setError("Prompt is required");
      return;
    }

    const outputFormat = validateOutputFormat();
    if (outputFormat === null) {
      return;
    }

    setIsSaving(true);

    try {
      if (preset) {
        // Update existing preset
        const updateData: UpdatePresetRequest = {
          name: name.trim(),
          prompt: prompt.trim(),
          max_length: maxLength !== "" ? Number(maxLength) : undefined,
          tone_guidance: toneGuidance.trim() || undefined,
          structure_template: structureTemplate.trim() || undefined,
          output_limit: outputLimit !== "" ? Number(outputLimit) : undefined,
          output_format:
            Object.keys(outputFormat).length > 0 ? outputFormat : undefined,
          is_default: isDefault,
        };
        await updatePreset(preset.id, updateData);
      } else {
        // Create new preset
        const createData: CreatePresetRequest = {
          name: name.trim(),
          prompt: prompt.trim(),
          max_length: maxLength !== "" ? Number(maxLength) : undefined,
          tone_guidance: toneGuidance.trim() || undefined,
          structure_template: structureTemplate.trim() || undefined,
          output_limit: outputLimit !== "" ? Number(outputLimit) : undefined,
          output_format:
            Object.keys(outputFormat).length > 0 ? outputFormat : undefined,
          is_default: isDefault,
        };
        await createPreset(createData);
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preset");
    } finally {
      setIsSaving(false);
    }
  };

  // Use a Portal to escape the React Flow transform context
  const content = (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-slate-900/5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Type size={18} strokeWidth={2.5} />
              </span>
              {preset ? "Edit Preset" : "New Preset"}
            </h2>
            <p className="text-sm text-slate-500 mt-1 ml-11">
              Configure text generation parameters and prompts
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
          {error && (
            <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl text-sm text-red-600 flex items-start gap-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold block mb-0.5">
                  Error Saving Preset
                </span>
                {error}
              </div>
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Preset Name <span className="text-emerald-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., LinkedIn Post Generator"
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm 
                       focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all 
                       placeholder:text-slate-400 text-slate-900 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tone Guidance */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Tone Guidance
              </label>
              <input
                type="text"
                value={toneGuidance}
                onChange={(e) => setToneGuidance(e.target.value)}
                placeholder="e.g., professional, witty"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm 
                         focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all 
                         placeholder:text-slate-400"
              />
            </div>

            {/* Max Length */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Max Length (chars)
              </label>
              <input
                type="number"
                value={maxLength}
                onChange={(e) =>
                  setMaxLength(
                    e.target.value === "" ? "" : Number(e.target.value),
                  )
                }
                placeholder="e.g., 1200"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm 
                         focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all 
                         placeholder:text-slate-400"
                min="1"
              />
            </div>
          </div>

          {/* Prompt Template */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Prompt Template{" "}
                <span className="text-emerald-500 ml-0.5">*</span>
              </label>
              <div className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono">
                Supports {"{source_context}"} variable
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter prompt template..."
              className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-mono 
                       focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all 
                       placeholder:text-slate-400 text-slate-800 leading-relaxed"
              rows={8}
            />
          </div>

          {/* Advanced Section (Collapsible in theory, open for now) */}
          <div className="pt-4 border-t border-slate-200/60">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">
              Advanced Configuration
            </h3>

            <div className="grid grid-cols-1 gap-6">
              {/* Structure Template */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Output Structure
                </label>
                <textarea
                  value={structureTemplate}
                  onChange={(e) => setStructureTemplate(e.target.value)}
                  placeholder="e.g., Hook, Body, CTA"
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm 
                           focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all 
                           placeholder:text-slate-400"
                  rows={2}
                />
              </div>

              {/* JSON Format */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  JSON Schema
                </label>
                <textarea
                  value={outputFormatJson}
                  onChange={(e) => {
                    setOutputFormatJson(e.target.value);
                    setError(null);
                  }}
                  placeholder='{"type": "object", ...}'
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm font-mono 
                           focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all 
                           text-emerald-400 placeholder:text-slate-600"
                  rows={4}
                />
              </div>
            </div>
          </div>

          {/* Default Checkbox */}
          <div className="flex items-center gap-3 p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/50">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                id="isDefault"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-5 h-5 text-emerald-600 border-emerald-300 rounded focus:ring-emerald-500/20"
              />
            </div>
            <label
              htmlFor="isDefault"
              className="text-sm font-medium text-slate-700 cursor-pointer select-none"
            >
              Set as default preset for new nodes
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-100 bg-white sticky bottom-0">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 
                     rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 
                     rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 
                     disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2 
                     transition-all hover:translate-y-px active:translate-y-0.5"
          >
            <Save size={18} strokeWidth={2} />
            {isSaving ? "Saving Changes..." : "Save Preset"}
          </button>
        </div>
      </div>
    </div>
  );

  // Only render portal when mounted on client
  if (!mounted) return null;

  return createPortal(content, document.body);
}
