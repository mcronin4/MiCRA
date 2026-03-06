"use client";

import React, { useEffect, useMemo, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  extractKeyframesFromFileId,
  type ExtractedImage,
  type FrameSelectionMode,
} from "@/lib/fastapi/image-extraction";
import { listFiles, type FileListItem } from "@/lib/fastapi/files";
import type { NodeConfig } from "@/types/workflow";
import { X, Video, Loader2 } from "lucide-react";
import Image from "next/image";

const MAX_FRAME_COUNT = 25;

const clampFrameCount = (value: number) => {
  if (Number.isNaN(value)) return 10;
  return Math.max(1, Math.min(value, MAX_FRAME_COUNT));
};

const config: NodeConfig = {
  type: "image-extraction",
  label: "Image Extraction",
  description: "Extract keyframes from video",
  inputs: [
    // Workflow mode input (from VideoBucket / upstream)
    { id: "source", label: "Video", type: "file" },
  ],
  outputs: [{ id: "images", label: "Selected Images", type: "image[]" }],
};

export function ImageExtractionNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const addImagesToBucket = useWorkflowStore((state) => state.addImagesToBucket);

  const showManualInputs = node?.manualInputEnabled ?? false;

  const initialSelectionMode: FrameSelectionMode =
    node?.inputs?.selection_mode === "manual" ? "manual" : "auto";
  const initialMaxFrames =
    typeof node?.inputs?.max_frames === "number"
      ? clampFrameCount(node.inputs.max_frames)
      : typeof node?.inputs?.frame_count === "number"
        ? clampFrameCount(node.inputs.frame_count)
        : 10;
  const initialImages =
    node?.outputs && Array.isArray(node.outputs.images)
      ? (node.outputs.images as ExtractedImage[])
      : [];

  const [selectionMode, setSelectionMode] =
    useState<FrameSelectionMode>(initialSelectionMode);
  const [maxFrames, setMaxFrames] = useState<number>(initialMaxFrames);
  const [selectedImages, setSelectedImages] =
    useState<ExtractedImage[]>(initialImages);
  const [metadata, setMetadata] = useState<Record<string, unknown>[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Video picker state (self-contained, no upload box)
  const [pickerFiles, setPickerFiles] = useState<FileListItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<FileListItem | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isLoadingPicker, setIsLoadingPicker] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);

  const isRunning = node?.status === "running";
  const scoredImages = useMemo(() => {
    const scoreLookup = new Map<string, number>();
    metadata.forEach((frame) => {
      const rawPath =
        typeof frame.selected_path === "string"
          ? frame.selected_path
          : typeof frame.frame_path === "string"
            ? frame.frame_path
            : "";
      const filename = rawPath ? rawPath.split(/[\\/]/).pop() : "";
      const score =
        typeof frame.quality_score === "number" ? frame.quality_score : null;
      if (filename && score !== null) {
        scoreLookup.set(filename, score);
      }
    });

    return selectedImages
      .filter((image) => image.base64 && image.filename)
      .map((image) => ({
        ...image,
        score: scoreLookup.get(image.filename) ?? null,
      }))
      .sort((a, b) => {
        const aScore = a.score ?? Number.NEGATIVE_INFINITY;
        const bScore = b.score ?? Number.NEGATIVE_INFINITY;
        if (aScore === bScore) return 0;
        return bScore - aScore;
      });
  }, [metadata, selectedImages]);

  const hasResults = scoredImages.length > 0;

  const formatScore = (score: number | null) => {
    if (score === null) return "N/A";
    return score.toFixed(2);
  };

  useEffect(() => {
    if (!node) return;
    const normalizedMaxFrames = clampFrameCount(maxFrames);
    if (
      node.inputs.selection_mode !== selectionMode ||
      node.inputs.max_frames !== normalizedMaxFrames
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          selection_mode: selectionMode,
          max_frames: normalizedMaxFrames,
        },
      });
    }
  }, [selectionMode, maxFrames, id, updateNode, node]);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled) {
      setSelectedImages([]);
      setMetadata([]);
      setStats(null);
      setSelectedVideo(null);
      setShowPicker(false);
      setPickerLoaded(false);
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, id, updateNode]);

  const openPicker = async () => {
    setShowPicker(true);
    if (!pickerLoaded) {
      setIsLoadingPicker(true);
      try {
        const response = await listFiles({
          type: "video",
          status: "uploaded",
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

  const pushImagesToBucket = (images: ExtractedImage[]) => {
    if (images.length === 0) return;
    const timestamp = Date.now();
    addImagesToBucket(
      images.map((image, index) => ({
        id: `${id}-${timestamp}-${index}`,
        base64: image.base64,
        name: image.filename,
      })),
    );
  };

  const handleExecute = async () => {
    updateNode(id, { status: "running", error: undefined });
    setSelectedImages([]);
    setMetadata([]);
    setStats(null);

    try {
      if (!selectedVideo) {
        throw new Error("Please select a video");
      }

      const manualMaxFrames =
        selectionMode === "manual" ? clampFrameCount(maxFrames) : undefined;

      const response = await extractKeyframesFromFileId(
        selectedVideo.id,
        selectionMode,
        manualMaxFrames,
      );
      if (!response.success) {
        throw new Error(response.error || "Image extraction failed");
      }
      const nextImages = response.selected_images || [];
      setSelectedImages(nextImages);
      setMetadata(response.selected_frames || []);
      setStats(response.stats || null);
      pushImagesToBucket(nextImages);
      updateNode(id, {
        status: "completed",
        outputs: { images: nextImages },
        inputs: {
          selection_mode: selectionMode,
          max_frames: manualMaxFrames ?? clampFrameCount(maxFrames),
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
      theme={nodeThemes.sky}
      getOutputDataType={(outputId, defaultType) =>
        outputId === "images" ? "images" : defaultType
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Frame Count
            </label>
            <select
              value={selectionMode}
              onChange={(event) =>
                setSelectionMode(event.target.value as FrameSelectionMode)
              }
              disabled={isRunning}
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
            >
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Max Frames
            </label>
            <input
              type="number"
              min={1}
              max={MAX_FRAME_COUNT}
              value={maxFrames}
              onChange={(event) =>
                setMaxFrames(clampFrameCount(Number(event.target.value)))
              }
              disabled={isRunning || selectionMode !== "manual"}
              className="nodrag w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all disabled:opacity-60"
            />
          </div>
        </div>

        {/* Video picker - self-contained, lazy-loaded */}
        {showManualInputs && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Video
            </label>

            {!showPicker && selectedVideo && (
              <div className="flex items-center gap-2 p-2.5 border border-sky-300 rounded-xl bg-sky-50">
                <Video size={16} className="text-sky-600 shrink-0" />
                <span className="text-sm font-medium text-slate-700 truncate flex-1">
                  {selectedVideo.name}
                </span>
                <button
                  onClick={() => { setSelectedVideo(null); }}
                  className="nodrag p-1 rounded-md hover:bg-sky-100 transition-colors"
                >
                  <X size={14} className="text-slate-400 hover:text-red-500" />
                </button>
              </div>
            )}

            <button
              onClick={() => (showPicker ? setShowPicker(false) : openPicker())}
              disabled={isRunning}
              className="nodrag w-full px-3 py-2 text-sm bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium transition-all hover:shadow-sm active:scale-[0.98] disabled:opacity-60"
            >
              {showPicker
                ? "Done"
                : selectedVideo
                  ? "Change Video"
                  : "Select Video"}
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
                      <Video size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">
                      No videos found
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Upload videos via the sidebar to get started
                    </p>
                  </div>
                ) : (
                  <div className="nodrag space-y-1 p-2 border border-slate-200 rounded-xl bg-slate-50 max-h-48 overflow-y-auto">
                    {pickerFiles.map((file) => {
                      const isSelected = selectedVideo?.id === file.id;
                      return (
                        <button
                          key={file.id}
                          onClick={() => {
                            setSelectedVideo(isSelected ? null : file);
                          }}
                          className={`
                            w-full px-3 py-2 text-left rounded-lg transition-all flex items-center gap-2
                            ${
                              isSelected
                                ? "bg-sky-100 border-2 border-sky-400"
                                : "bg-white hover:bg-slate-100 border-2 border-transparent"
                            }
                          `}
                        >
                          <Video
                            size={16}
                            className={
                              isSelected ? "text-sky-600" : "text-slate-400"
                            }
                          />
                          <span className="flex-1 text-xs font-medium text-slate-700 truncate">
                            {file.name}
                          </span>
                          {isSelected && (
                            <div className="w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-white rounded-full" />
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

        {stats && (
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
            {"scenes_detected" in stats && (
              <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white">
                Scenes: {stats.scenes_detected}
              </span>
            )}
            {"candidates_sampled" in stats && (
              <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white">
                Candidates: {stats.candidates_sampled}
              </span>
            )}
            {"final_selected" in stats && (
              <span className="px-2.5 py-1 rounded-full border border-slate-200 bg-white">
                Selected: {stats.final_selected}
              </span>
            )}
          </div>
        )}

        {hasResults && (
          <div
            className="nodrag border border-slate-200 rounded-xl bg-white p-3 cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setShowGallery(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setShowGallery(true);
              }
            }}
            aria-label="Open selected frames gallery"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wide">
                Selected frames
              </span>
              <div className="flex items-center gap-2">
                <span>{scoredImages.length} total</span>
                <button
                  onClick={() => setShowGallery(true)}
                  className="nodrag text-sky-600 hover:text-sky-700 font-medium transition-colors"
                >
                  Expand
                </button>
              </div>
            </div>
            <div className="nodrag nowheel grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
              {scoredImages.map((img, index) => (
                <div key={`${img.id}-${index}`} className="relative">
                  <Image
                    src={img.base64}
                    alt={img.filename}
                    width={96}
                    height={64}
                    className="w-full aspect-video object-cover rounded-lg border border-slate-200"
                    unoptimized
                  />
                  <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {formatScore(img.score)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Click to expand and download any frame
            </div>
          </div>
        )}

        {/* Test Node button - show when test mode is enabled */}
        {node?.manualInputEnabled && (
          <button
            onClick={handleExecute}
            disabled={node?.status === "running" || !selectedVideo}
            className={`
              nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
              transition-all duration-200
              ${
                node?.status === "running" || !selectedVideo
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg"
              }
            `}
          >
            {node?.status === "running" ? "Running..." : "Test Node"}
          </button>
        )}
      </div>

      {showGallery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setShowGallery(false)}
            aria-hidden="true"
          />
          <div
            className="nodrag relative w-[95vw] max-w-6xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Selected frames
                </h4>
                <p className="text-xs text-slate-500">
                  Click any image to download
                </p>
              </div>
              <button
                type="button"
                className="nodrag p-2 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setShowGallery(false)}
                aria-label="Close gallery"
              >
                <X size={16} />
              </button>
            </div>
            <div className="nowheel p-5 overflow-y-auto max-h-[calc(92vh-70px)]">
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                {scoredImages.map((img, index) => (
                  <a
                    key={`${img.id}-${index}`}
                    href={img.base64}
                    download={img.filename}
                    className="nodrag group relative rounded-xl border border-slate-200 bg-white overflow-hidden transition-shadow hover:shadow-md"
                    title={`Download ${img.filename}`}
                  >
                    <div className="bg-slate-100">
                      <Image
                        src={img.base64}
                        alt={img.filename}
                        width={640}
                        height={360}
                        className="w-full h-auto object-contain"
                        unoptimized
                      />
                    </div>
                    <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {formatScore(img.score)}
                    </div>
                    <div className="p-2 text-[10px] text-slate-500 truncate">
                      {img.filename}
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkflowNodeWrapper>
  );
}
