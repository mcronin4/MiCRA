"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  matchImagesToText,
  type ImageWithId,
  type ImageMatchResult,
} from "@/lib/fastapi/image-matching";
import { listFiles, type FileListItem } from "@/lib/fastapi/files";
import type { NodeConfig } from "@/types/workflow";
import {
  Check,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { useNodeConnections } from "@/hooks/useNodeConnections";

type MatchCountMode = "all" | "manual";

const MAX_MATCH_COUNT = 25;
const DEFAULT_AUTO_LIMIT = 10;

const clampMatchCount = (value: number) => {
  if (Number.isNaN(value)) return 5;
  return Math.max(1, Math.min(value, MAX_MATCH_COUNT));
};

// Config for this node type
const config: NodeConfig = {
  type: "image-matching",
  label: "Image-Text Matching",
  description: "Match images with text using VLM",
  inputs: [
    { id: "images", label: "Images", type: "image[]" },
    { id: "text", label: "Text", type: "string" },
  ],
  outputs: [{ id: "images", label: "Matched Images", type: "image[]" }],
};

export function ImageMatchingNode({ id }: NodeProps) {
  // Get the node from Zustand store
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const { hasConnections } = useNodeConnections(id);

  // Determine if manual inputs should be shown
  const showManualInputs = node?.manualInputEnabled ?? false;

  // Initial state from node inputs
  const initialText =
    typeof node?.inputs?.text === "string" ? node.inputs.text : "";
  const initialMatchCountMode: MatchCountMode =
    node?.inputs?.match_count_mode === "manual" ? "manual" : "all";
  const initialMaxMatches =
    typeof node?.inputs?.max_matches === "number"
      ? clampMatchCount(node.inputs.max_matches)
      : 5;

  const [text, setText] = useState<string>(initialText);
  const [matchCountMode, setMatchCountMode] =
    useState<MatchCountMode>(initialMatchCountMode);
  const [maxMatches, setMaxMatches] = useState<number>(initialMaxMatches);
  const [imageResults, setImageResults] = useState<
    Map<string, ImageMatchResult>
  >(new Map());
  const matchedImages = Array.isArray(node?.outputs?.images)
    ? node.outputs.images
    : [];
  const hasMatchResults = matchedImages.length > 0;

  // Self-contained image picker state (no global bucket dependency)
  const [pickerFiles, setPickerFiles] = useState<FileListItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileListItem[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      setImageResults(new Map());
      setSelectedFiles([]);
      setShowPicker(false);
      setPickerLoaded(false);
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  useEffect(() => {
    const normalizedMaxMatches = clampMatchCount(maxMatches);
    if (
      node &&
      (node.inputs.text !== text ||
        node.inputs.match_count_mode !== matchCountMode ||
        node.inputs.max_matches !== normalizedMaxMatches)
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          text: text,
          match_count_mode: matchCountMode,
          max_matches: normalizedMaxMatches,
        },
      });
    }
  }, [text, matchCountMode, maxMatches, id, updateNode, node]);

  const openPicker = async () => {
    setShowPicker(true);
    if (!pickerLoaded) {
      setIsLoadingPicker(true);
      try {
        const response = await listFiles({
          type: "image",
          status: "uploaded",
          includeUrls: true,
          thumbnailsOnly: true,
          limit: 100,
        });
        setPickerFiles(response.items);
        setPickerLoaded(true);
      } catch {
        // Empty picker is a valid state
      } finally {
        setIsLoadingPicker(false);
      }
    }
  };

  const toggleFile = (file: FileListItem) => {
    setSelectedFiles((prev) => {
      if (prev.some((f) => f.id === file.id)) {
        return prev.filter((f) => f.id !== file.id);
      }
      return [...prev, file];
    });
  };

  const selectAll = () => {
    setSelectedFiles([...pickerFiles]);
  };

  const deselectAll = () => {
    setSelectedFiles([]);
  };

  const handleExecute = async () => {
    updateNode(id, { status: "running", error: undefined });
    setImageResults(new Map());

    try {
      if (selectedFiles.length === 0) throw new Error("No images selected");
      if (!text.trim()) throw new Error("No text entered");

      // Fetch full signed URLs for the selected files (picker only has thumbnails)
      const fullRes = await listFiles({
        ids: selectedFiles.map((f) => f.id),
        includeUrls: true,
      });

      const imagesForApi: ImageWithId[] = await Promise.all(
        fullRes.items.map(async (file) => {
          const url = file.signedUrl;
          if (!url) throw new Error(`No URL available for ${file.name}`);
          const resp = await fetch(url);
          const blob = await resp.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return { id: file.id, base64 };
        }),
      );

      const response = await matchImagesToText(imagesForApi, text);

      if (!response.success) {
        throw new Error(response.error || "Matching failed");
      }

      const resultsMap = new Map<string, ImageMatchResult>();
      response.results.forEach((result) => {
        resultsMap.set(result.image_id, result);
      });
      setImageResults(resultsMap);

      const fileById = new Map(
        selectedFiles.map((f) => [f.id, f] as const),
      );
      const matches = response.results
        .map((result) => {
          const file = fileById.get(result.image_id);
          const similarityScore =
            typeof result.combined_score === "number"
              ? result.combined_score
              : 0;
          return {
            image_url: file?.signedUrl || file?.thumbnailUrl || "",
            similarity_score: similarityScore,
            caption: "",
            status: result.status,
            error: result.error,
          };
        })
        .sort((a, b) => b.similarity_score - a.similarity_score);

      const limitedMatches =
        matchCountMode === "manual"
          ? matches.slice(0, clampMatchCount(maxMatches))
          : matches.slice(0, DEFAULT_AUTO_LIMIT);
      const images = limitedMatches.filter(
        (match) =>
          typeof match.image_url === "string" && match.image_url.length > 0,
      );

      updateNode(id, {
        status: "completed",
        outputs: { images },
        inputs: {
          text,
          match_count_mode: matchCountMode,
          max_matches: clampMatchCount(maxMatches),
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      updateNode(id, { status: "error", error: errorMessage });
    }
  };

  return (
    <WorkflowNodeWrapper
      nodeId={id}
      config={config}
      onExecute={handleExecute}
      theme={nodeThemes.amber}
      getOutputDataType={(outputId, defaultType) =>
        outputId === "images" ? "images" : defaultType
      }
    >
      <div className="space-y-4">

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Match Count
            </label>
            <select
              value={matchCountMode}
              onChange={(event) =>
                setMatchCountMode(event.target.value as MatchCountMode)
              }
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all"
            >
              <option value="all">All</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Max Matches
            </label>
            <input
              type="number"
              min={1}
              max={MAX_MATCH_COUNT}
              value={maxMatches}
              onChange={(event) =>
                setMaxMatches(clampMatchCount(Number(event.target.value)))
              }
              disabled={matchCountMode !== "manual"}
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all disabled:opacity-60"
            />
          </div>
        </div>

        {/* Text input - only show in test mode */}
        {showManualInputs && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Text Description
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to match..."
              className="nodrag w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all placeholder:text-slate-400"
              rows={3}
            />
          </div>
        )}

        {/* Image Selection - self-contained picker */}
        {showManualInputs && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Images
                </label>
                {selectedFiles.length > 0 && (
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {selectedFiles.length} selected
                  </span>
                )}
              </div>
              {showPicker && pickerFiles.length > 0 && (
                <div className="flex gap-1">
                  <button
                    onClick={selectAll}
                    className="text-[10px] text-slate-500 hover:text-amber-600 transition-colors px-2 py-0.5"
                  >
                    Select all
                  </button>
                  <button
                    onClick={deselectAll}
                    className="text-[10px] text-slate-500 hover:text-amber-600 transition-colors px-2 py-0.5"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {!showPicker && selectedFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5 p-2 border border-slate-200 rounded-xl bg-white">
                {selectedFiles.slice(0, 4).map((file) => {
                  const result = imageResults.get(file.id);
                  return (
                    <div
                      key={file.id}
                      className="relative aspect-square rounded-lg overflow-hidden border border-amber-300"
                    >
                      {(file.thumbnailUrl || file.signedUrl) && (
                        <Image
                          src={file.thumbnailUrl || file.signedUrl!}
                          alt={file.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      )}
                      {result && result.status === "success" && (
                        <div className="absolute bottom-0 left-0 right-0 bg-green-500 text-white text-[9px] px-1 py-0.5 text-center">
                          {(result.combined_score! * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  );
                })}
                {selectedFiles.length > 4 && (
                  <div className="aspect-square rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                    <span className="text-xs font-medium text-slate-500">
                      +{selectedFiles.length - 4}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => (showPicker ? setShowPicker(false) : openPicker())}
              className="nodrag w-full px-3 py-2 text-sm bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium transition-all hover:shadow-sm active:scale-[0.98]"
            >
              {showPicker
                ? "Done"
                : selectedFiles.length > 0
                  ? "Change Images"
                  : "Select Images"}
            </button>

            {showPicker && (
              <>
                {isLoadingPicker ? (
                  <div className="flex justify-center py-6">
                    <Loader2
                      size={20}
                      className="animate-spin text-slate-400"
                    />
                  </div>
                ) : pickerFiles.length === 0 ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
                      <ImageIcon size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">
                      No images found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload images via the sidebar to get started
                    </p>
                  </div>
                ) : (
                  <div className="nodrag grid grid-cols-3 gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-48 overflow-y-auto">
                    {pickerFiles.map((file) => {
                      const isSelected = selectedFiles.some(
                        (f) => f.id === file.id,
                      );
                      const result = imageResults.get(file.id);
                      const isNodeRunning =
                        node?.status === "running" && isSelected && !result;

                      return (
                        <button
                          key={file.id}
                          onClick={() => toggleFile(file)}
                          className={`
                            relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                            ${
                              isSelected
                                ? "border-amber-400 ring-2 ring-amber-200"
                                : "border-transparent hover:border-slate-300"
                            }
                          `}
                        >
                          {(file.thumbnailUrl || file.signedUrl) && (
                            <Image
                              src={file.thumbnailUrl || file.signedUrl!}
                              alt={file.name}
                              fill
                              className={`object-cover ${result?.status === "failed" ? "opacity-50" : ""}`}
                              unoptimized
                            />
                          )}

                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                              <Check
                                size={12}
                                className="text-white"
                                strokeWidth={3}
                              />
                            </div>
                          )}

                          {isNodeRunning && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            </div>
                          )}

                          {result && (
                            <div
                              className={`absolute bottom-0 left-0 right-0 text-[9px] px-1 py-0.5 ${
                                result.status === "success"
                                  ? "bg-green-500 text-white"
                                  : "bg-red-500 text-white"
                              }`}
                            >
                              {result.status === "success" ? (
                                <span>
                                  {(result.combined_score! * 100).toFixed(0)}%
                                </span>
                              ) : (
                                <div className="flex items-center gap-0.5">
                                  <AlertCircle size={8} />
                                  <span className="truncate">
                                    {result.error || "Failed"}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {/* Test Node button - show when test mode is enabled */}
        {node?.manualInputEnabled && (
          <button
            onClick={handleExecute}
            disabled={node?.status === "running" || selectedFiles.length === 0 || !text.trim()}
            className={`
              nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
              transition-all duration-200
              ${
                node?.status === "running" || selectedFiles.length === 0 || !text.trim()
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg"
              }
            `}
          >
            {node?.status === "running" ? "Running..." : "Test Node"}
          </button>
        )}
      </div>
    </WorkflowNodeWrapper>
  );
}
