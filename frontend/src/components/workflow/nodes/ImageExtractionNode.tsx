"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  extractKeyframesFromFile,
  extractKeyframesFromUrl,
  ExtractedImage,
} from "@/lib/fastapi/image-extraction";
import { NodeConfig } from "@/types/workflow";
import { Upload, Link, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";

type SourceType = "file" | "url";

const config: NodeConfig = {
  type: "image-extraction",
  label: "Image Extraction",
  description: "Extract keyframes from video or YouTube URL",
  inputs: [
    { id: "video", label: "Video File", type: "file" },
    { id: "url", label: "YouTube URL", type: "string" },
  ],
  outputs: [
    { id: "images", label: "Selected Images", type: "image[]" },
    { id: "metadata", label: "Metadata", type: "json" },
  ],
};

export function ImageExtractionNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const addImagesToBucket = useWorkflowStore((state) => state.addImagesToBucket);

  const nodeOutputs =
    node?.outputs && typeof node.outputs === "object"
      ? (node.outputs as Record<string, unknown>)
      : {};

  const initialSourceType: SourceType =
    node?.inputs?.source_type === "url" ? "url" : "file";
  const initialUrl =
    typeof node?.inputs?.url === "string" ? node.inputs.url : "";
  const initialFileName =
    typeof node?.inputs?.file_name === "string" ? node.inputs.file_name : "";
  const initialImages = Array.isArray(nodeOutputs.images)
    ? (nodeOutputs.images as ExtractedImage[])
    : [];
  const initialMetadata = Array.isArray(nodeOutputs.metadata)
    ? (nodeOutputs.metadata as Record<string, unknown>[])
    : [];
  const initialStats =
    nodeOutputs.stats &&
    typeof nodeOutputs.stats === "object" &&
    !Array.isArray(nodeOutputs.stats)
      ? (nodeOutputs.stats as Record<string, number>)
      : null;

  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType);
  const [videoUrl, setVideoUrl] = useState<string>(initialUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>(initialFileName);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImages, setSelectedImages] =
    useState<ExtractedImage[]>(initialImages);
  const [metadata, setMetadata] = useState<Record<string, unknown>[]>(
    initialMetadata,
  );
  const [stats, setStats] = useState<Record<string, number> | null>(
    initialStats,
  );
  const [showGallery, setShowGallery] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const topImages = scoredImages.slice(0, 3);
  const hasResults = scoredImages.length > 0;

  const formatScore = (score: number | null) => {
    if (score === null) return "N/A";
    return score.toFixed(2);
  };

  useEffect(() => {
    if (!node) return;
    if (
      node.inputs.source_type !== sourceType ||
      node.inputs.url !== videoUrl ||
      node.inputs.file_name !== fileName
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          source_type: sourceType,
          url: videoUrl,
          file_name: fileName,
        },
      });
    }
  }, [sourceType, videoUrl, fileName, id, updateNode, node]);

  const handleSelectFile = (file: File) => {
    setSelectedFile(file);
    setFileName(file.name);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    handleSelectFile(e.target.files[0]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isRunning) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isRunning || sourceType !== "file") return;
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleSelectFile(droppedFile);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setFileName("");
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
      if (sourceType === "url") {
        if (!videoUrl.trim()) {
          throw new Error("Please enter a YouTube URL");
        }
        const response = await extractKeyframesFromUrl(videoUrl.trim());
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
          outputs: {
            images: nextImages,
            metadata: response.selected_frames || [],
            stats: response.stats || null,
            output_dir: response.output_dir || "",
            selected_json_path: response.selected_json_path || "",
          },
          inputs: {
            source_type: sourceType,
            url: videoUrl,
            file_name: "",
          },
        });
      } else {
        if (!selectedFile) {
          throw new Error("Please upload an MP4 file");
        }
        const isMp4 =
          selectedFile.type === "video/mp4" ||
          selectedFile.name.toLowerCase().endsWith(".mp4");
        if (!isMp4) {
          throw new Error("Please upload an MP4 file");
        }
        const response = await extractKeyframesFromFile(selectedFile);
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
          outputs: {
            images: nextImages,
            metadata: response.selected_frames || [],
            stats: response.stats || null,
            output_dir: response.output_dir || "",
            selected_json_path: response.selected_json_path || "",
          },
          inputs: {
            source_type: sourceType,
            url: "",
            file_name: selectedFile.name,
          },
        });
      }
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
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setSourceType("file");
              setVideoUrl("");
            }}
            className={`nodrag flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-all ${
              sourceType === "file"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Upload MP4
          </button>
          <button
            type="button"
            disabled={isRunning}
            onClick={() => {
              setSourceType("url");
              clearFile();
            }}
            className={`nodrag flex-1 px-3 py-2 text-xs font-semibold rounded-xl transition-all ${
              sourceType === "url"
                ? "bg-sky-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            YouTube URL
          </button>
        </div>

        {sourceType === "url" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              YouTube URL
            </label>
            <div className="relative">
              <Link
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                disabled={isRunning}
                className="nodrag w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 transition-all"
              />
            </div>
          </div>
        )}

        {sourceType === "file" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Video File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/*"
              onChange={handleFileInput}
              className="hidden"
            />
            <div
              onClick={() => !isRunning && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                nodrag relative w-full border border-dashed rounded-xl transition-all duration-200 cursor-pointer
                ${
                  isDragging
                    ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                }
                ${isRunning ? "opacity-60 cursor-not-allowed" : ""}
              `}
            >
              <div className="flex flex-col items-center justify-center text-center py-4">
                <div
                  className={`p-2.5 rounded-lg mb-2 ${
                    isDragging
                      ? "bg-sky-100 text-sky-600"
                      : "bg-white text-slate-400 shadow-sm border border-slate-100"
                  }`}
                >
                  <Upload size={18} strokeWidth={2} />
                </div>
                <p
                  className={`text-sm font-medium ${
                    isDragging ? "text-sky-700" : "text-slate-700"
                  }`}
                >
                  {fileName ? fileName : "Drag & drop MP4 here"}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  or click to browse (MP4 only)
                </p>
              </div>
            </div>
            {fileName && (
              <button
                type="button"
                onClick={clearFile}
                disabled={isRunning}
                className="nodrag inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-500 transition-colors"
              >
                <X size={12} />
                Remove file
              </button>
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

        {hasResults ? (
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
              <span>{scoredImages.length} total</span>
            </div>
            <div className="flex gap-2">
              {topImages.map((img) => (
                <div key={img.id} className="relative w-20 shrink-0">
                  <Image
                    src={img.base64}
                    alt={img.filename}
                    width={96}
                    height={64}
                    className="w-20 h-14 object-cover rounded-lg border border-slate-200"
                    unoptimized
                  />
                  <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {formatScore(img.score)}
                  </div>
                </div>
              ))}
              {topImages.length === 0 && (
                <div className="text-xs text-slate-400">
                  No images selected yet.
                </div>
              )}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Click to expand and download any frame
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
            <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
              <ImageIcon size={18} className="text-slate-400" />
            </div>
            <p className="text-xs font-medium text-slate-600">
              No frames yet
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Run extraction to populate selected frames
            </p>
          </div>
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
            <div className="p-5 overflow-y-auto max-h-[calc(92vh-70px)]">
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                {scoredImages.map((img) => (
                  <a
                    key={img.id}
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
