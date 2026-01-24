"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore, ImageBucketItem } from "@/lib/stores/workflowStore";
import {
  matchImagesToText,
  ImageWithId,
  ImageMatchResult,
} from "@/lib/fastapi/image-matching";
import { NodeConfig } from "@/types/workflow";
import {
  X,
  Check,
  AlertCircle,
  Image as ImageIcon,
  RefreshCw,
} from "lucide-react";
import Image from "next/image";

// Config for this node type
const config: NodeConfig = {
  type: "image-matching",
  label: "Image-Text Matching",
  description: "Match images with text using VLM",
  inputs: [
    { id: "images", label: "Images", type: "image[]" },
    { id: "text", label: "Text", type: "string" },
  ],
  outputs: [{ id: "matches", label: "Results", type: "json" }],
};

export function ImageMatchingNode({ id }: NodeProps) {
  // Get the node and image bucket from the Zustand state manager
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const imageBucket = useWorkflowStore((state) => state.imageBucket);

  // If there are already inputs associated with the node, use them as initial state
  const initialText =
    typeof node?.inputs?.text === "string" ? node.inputs.text : "";
  const initialSelectedIds = Array.isArray(node?.inputs?.selectedImageIds)
    ? (node.inputs.selectedImageIds as string[])
    : [];

  const [text, setText] = useState<string>(initialText);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    new Set(initialSelectedIds),
  );
  const [imageResults, setImageResults] = useState<
    Map<string, ImageMatchResult>
  >(new Map());

  // Get images that are selected from the bucket
  const selectedImages: ImageBucketItem[] = imageBucket.filter((img) =>
    selectedImageIds.has(img.id),
  );

  // Syncing to Zustand store
  useEffect(() => {
    const idsArray = Array.from(selectedImageIds);
    if (
      node &&
      (node.inputs.text !== text ||
        JSON.stringify(node.inputs.selectedImageIds) !==
          JSON.stringify(idsArray))
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          text: text,
          selectedImageIds: idsArray,
        },
      });
    }
  }, [text, selectedImageIds, id, updateNode, node]);

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
      const imagesForApi: ImageWithId[] = selectedImages.map((img) => ({
        id: img.id,
        base64: img.base64,
      }));

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

      // Update node
      updateNode(id, {
        status: "completed",
        outputs: { results: response.results },
        inputs: { selectedImageIds: Array.from(selectedImageIds), text },
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
    >
      <div className="space-y-4">
        {/* Text input */}
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

        {/* Image Selection from Bucket */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                Select Images
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
                Upload images using the Image Bucket in the sidebar
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
                      src={image.base64}
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
      </div>
    </WorkflowNodeWrapper>
  );
}
