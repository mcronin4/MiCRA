"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore, type ImageBucketItem } from "@/lib/stores/workflowStore";
import {
  matchImagesToText,
  type ImageWithId,
  type ImageMatchResult,
} from "@/lib/fastapi/image-matching";
import { getImageBase64, getImageSrc } from "@/lib/utils/imageUtils";
import type { NodeConfig } from "@/types/workflow";
import {
  Check,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";
import { useNodeConnections } from "@/hooks/useNodeConnections";

type MatchCountMode = "all" | "manual";

const clampMatchCount = (value: number) => {
  if (Number.isNaN(value)) return 5;
  return Math.max(1, Math.min(value, 200));
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
  const { hasConnections, connections } = useNodeConnections(id);

  // Check which specific inputs are connected
  const hasImageInput = connections.some((c) => c.inputKey === "images");

  // Determine if manual inputs should be shown
  // Only show manual inputs when test mode is enabled
  const showManualInputs = node?.manualInputEnabled ?? false;

  // Initial state from node inputs
  const initialText =
    typeof node?.inputs?.text === "string" ? node.inputs.text : "";
  const initialSelectedIds = Array.isArray(node?.inputs?.selectedImageIds)
    ? (node.inputs.selectedImageIds as string[])
    : [];
  const initialMatchCountMode: MatchCountMode =
    node?.inputs?.match_count_mode === "manual" ? "manual" : "all";
  const initialMaxMatches =
    typeof node?.inputs?.max_matches === "number"
      ? clampMatchCount(node.inputs.max_matches)
      : 5;

  const [text, setText] = useState<string>(initialText);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(initialSelectedIds),
  );
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

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      setImageResults(new Map());
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  const imageBucket = useWorkflowStore((state) => state.imageBucket);
  const selectedImages: ImageBucketItem[] = showManualInputs
    ? imageBucket.filter((img) => selectedImageIds.has(img.id))
    : [];

  useEffect(() => {
    const idsArray = Array.from(selectedImageIds);
    const normalizedMaxMatches = clampMatchCount(maxMatches);
    if (
      node &&
      (node.inputs.text !== text ||
        JSON.stringify(node.inputs.selectedImageIds) !==
          JSON.stringify(idsArray) ||
        node.inputs.match_count_mode !== matchCountMode ||
        node.inputs.max_matches !== normalizedMaxMatches)
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          text: text,
          selectedImageIds: idsArray,
          match_count_mode: matchCountMode,
          max_matches: normalizedMaxMatches,
        },
      });
    }
  }, [text, selectedImageIds, matchCountMode, maxMatches, id, updateNode, node]);

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedImageIds(new Set(imageBucket.map((img) => img.id)));
  };

  const deselectAll = () => {
    setSelectedImageIds(new Set());
  };

  const handleExecute = async () => {
    updateNode(id, { status: "running", error: undefined });
    setImageResults(new Map());

    try {
      if (selectedImages.length === 0) throw new Error("No images selected");
      if (!text.trim()) throw new Error("No text entered");

      // Convert bucket items to ImageWithId format for the API
      // Fetch base64 from signedUrl if needed
      const imagesForApi: ImageWithId[] = await Promise.all(
        selectedImages.map(async (img) => ({
          id: img.id,
          base64: img.base64 || await getImageBase64(img),
        }))
      );

      // Call API
      const response = await matchImagesToText(imagesForApi, text);

      if (!response.success) {
        throw new Error(response.error || "Matching failed");
      }

      // Store results by image ID
      const resultsMap = new Map<string, ImageMatchResult>();
      response.results.forEach((result) => {
        resultsMap.set(result.image_id, result);
      });
      setImageResults(resultsMap);
      const selectedImageById = new Map(
        selectedImages.map((img) => [img.id, img] as const),
      );
      const matches = response.results
        .map((result) => {
          const image = selectedImageById.get(result.image_id);
          const similarityScore =
            typeof result.combined_score === "number"
              ? result.combined_score
              : 0;
          return {
            image_url: image ? getImageSrc(image) : "",
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
          : matches;
      const images = limitedMatches.filter(
        (match) => typeof match.image_url === "string" && match.image_url.length > 0,
      );

      // Update node
      updateNode(id, {
        status: "completed",
        outputs: {
          images,
        },
        inputs: {
          selectedImageIds: Array.from(selectedImageIds),
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
        {!showManualInputs &&
          (hasMatchResults ? (
            <div className="border border-slate-200 rounded-xl p-4 bg-white text-center">
              <div className="p-2.5 rounded-xl bg-amber-50 w-fit mx-auto mb-2">
                <ImageIcon size={18} className="text-amber-500" />
              </div>
              <p className="text-xs font-medium text-slate-700">
                Match results ready
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {matchedImages.length} image
                {matchedImages.length === 1 ? "" : "s"} available
              </p>
            </div>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
              <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
                <ImageIcon size={18} className="text-slate-400" />
              </div>
              <p className="text-xs font-medium text-slate-600">
                No matches yet
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Run workflow to populate matched images
              </p>
            </div>
          ))}

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
              max={200}
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

        {/* Image Selection from Bucket */}
        {showManualInputs && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Select Images
                  {hasImageInput && (
                    <span className="ml-2 text-xs text-amber-600 font-normal normal-case">(from ImageBucket)</span>
                  )}
                </label>
                {selectedImageIds.size > 0 && (
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    {selectedImageIds.size} selected
                  </span>
                )}
              </div>
              {imageBucket.length > 0 && (
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

            {imageBucket.length === 0 ? (
            // Empty bucket state
            <div className="border border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 text-center">
              <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
                <ImageIcon size={20} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">
                No images in bucket
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Connect ImageBucket node or upload images using the Image Bucket in the sidebar
              </p>
            </div>
          ) : (
            // Image grid from bucket
            <div className="nodrag grid grid-cols-3 gap-2 p-3 border border-slate-200 rounded-xl bg-slate-50 max-h-48 overflow-y-auto">
              {imageBucket.map((image) => {
                const isSelected = selectedImageIds.has(image.id);
                const result = imageResults.get(image.id);
                const isRunning =
                  node?.status === "running" && isSelected && !result;

                return (
                  <button
                    key={image.id}
                    onClick={() => toggleImageSelection(image.id)}
                    className={`
                      relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                      ${
                        isSelected
                          ? "border-amber-400 ring-2 ring-amber-200"
                          : "border-transparent hover:border-slate-300"
                      }
                    `}
                  >
                    <Image
                      src={getImageSrc(image)}
                      alt={image.name}
                      fill
                      className={`object-cover ${result?.status === "failed" ? "opacity-50" : ""}`}
                      unoptimized
                    />

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center shadow-md">
                        <Check
                          size={12}
                          className="text-white"
                          strokeWidth={3}
                        />
                      </div>
                    )}

                    {/* Loading overlay */}
                    {isRunning && (
                      <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      </div>
                    )}

                    {/* Result badge */}
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
          </div>
        )}
        {/* Test Node button - show when test mode is enabled */}
        {node?.manualInputEnabled && (
          <button
            onClick={handleExecute}
            disabled={node?.status === "running" || selectedImages.length === 0 || !text.trim()}
            className={`
              nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
              transition-all duration-200
              ${
                node?.status === "running" || selectedImages.length === 0 || !text.trim()
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
