"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore, ImageBucketItem } from "@/lib/stores/workflowStore";
import {
  generateVideo,
  GenerateVideoRequest,
} from "@/lib/fastapi/video-generation";
import { getImageBase64 } from "@/lib/utils/imageUtils";
import { NodeConfig } from "@/types/workflow";
import {
  Download,
  RectangleHorizontal,
  RectangleVertical,
  ChevronDown,
  ChevronUp,
  Check,
  Image as ImageIcon,
} from "lucide-react";
import Image from "next/image";
import { getImageSrc } from "@/lib/utils/imageUtils";
import { useNodeConnections } from "@/hooks/useNodeConnections";

const config: NodeConfig = {
  type: "VideoGeneration",
  label: "Video Generation",
  description: "Generate videos with AI",
  inputs: [
    { id: "images", label: "Images", type: "image[]" },
    { id: "videos", label: "Videos", type: "file" },
    { id: "text", label: "Text", type: "string" },
  ],
  outputs: [{ id: "generated_video", label: "Generated Video", type: "file" }],
};

const VIDEO_STYLES = [
  { value: "", label: "None" },
  { value: "marketing", label: "Marketing" },
  { value: "slideshow", label: "Slideshow" },
  { value: "product_demo", label: "Product Demo" },
  { value: "cinematic", label: "Cinematic" },
  { value: "documentary", label: "Documentary" },
  { value: "__custom__", label: "Custom" },
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "Landscape", icon: RectangleHorizontal },
  { value: "9:16", label: "Portrait", icon: RectangleVertical },
];

const DURATIONS = [
  { value: "8", label: "8s" },
  { value: "16", label: "16s" },
  { value: "__custom__", label: "Custom" },
];

const RESOLUTIONS = [
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "4k", label: "4K" },
];

export function VideoGenerationNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const imageBucket = useWorkflowStore((state) => state.imageBucket);
  const { hasConnections } = useNodeConnections(id);

  const showManualInputs = node?.manualInputEnabled ?? false;

  const initialPrompt =
    typeof node?.inputs?.user_prompt === "string" ? node.inputs.user_prompt : "";
  const initialAspectRatio =
    typeof node?.inputs?.aspect_ratio === "string"
      ? node.inputs.aspect_ratio
      : "9:16";
  const initialDuration =
    typeof node?.inputs?.duration_seconds === "string"
      ? node.inputs.duration_seconds
      : "8";
  const initialResolution =
    typeof node?.inputs?.resolution === "string"
      ? node.inputs.resolution
      : "720p";
  const initialNegativePrompt =
    typeof node?.inputs?.negative_prompt === "string"
      ? node.inputs.negative_prompt
      : "";
  const initialVideoStyle =
    typeof node?.inputs?.video_style === "string"
      ? node.inputs.video_style
      : "";

  const [prompt, setPrompt] = useState<string>(initialPrompt);
  const [videoStyle, setVideoStyle] = useState<string>(initialVideoStyle);
  const [customStyle, setCustomStyle] = useState<string>(
    // If the saved style isn't a preset key, it's a custom value
    initialVideoStyle && !VIDEO_STYLES.slice(0, -1).some(s => s.value === initialVideoStyle)
      ? initialVideoStyle : ""
  );
  const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio);
  const [duration, setDuration] = useState<string>(initialDuration);
  const [customDuration, setCustomDuration] = useState<string>(
    // If the saved duration isn't a preset, it's a custom value
    initialDuration && !["8", "16"].includes(initialDuration) ? initialDuration : ""
  );
  const [resolution, setResolution] = useState<string>(initialResolution);
  const [negativePrompt, setNegativePrompt] = useState<string>(initialNegativePrompt);
  const [showNegativePrompt, setShowNegativePrompt] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [promptBundle, setPromptBundle] = useState<Record<string, unknown> | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      setGeneratedVideoUrl(null);
      setPromptBundle(null);
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  // Sync params to store
  useEffect(() => {
    if (node) {
      // Sanitize sentinel values — never send "__custom__" to backend
      const effectiveStyle = videoStyle === "__custom__" ? "" : videoStyle;
      const effectiveDuration = duration === "__custom__" ? (customDuration || "10") : duration;
      updateNode(id, {
        inputs: {
          ...node.inputs,
          user_prompt: prompt,
          video_style: effectiveStyle,
          aspect_ratio: aspectRatio,
          duration_seconds: effectiveDuration,
          resolution,
          negative_prompt: negativePrompt,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, videoStyle, aspectRatio, duration, customDuration, resolution, negativePrompt]);

  const handleDownload = () => {
    if (!generatedVideoUrl) return;
    const link = document.createElement("a");
    link.href = generatedVideoUrl;
    link.download = `generated-video-${Date.now()}.mp4`;
    link.click();
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds((prev) =>
      prev.includes(imageId)
        ? prev.filter((id) => id !== imageId)
        : prev.length < 3
          ? [...prev, imageId]
          : prev
    );
  };

  const handleExecute = async () => {
    if (!prompt.trim()) {
      updateNode(id, { status: "error", error: "Please enter a prompt" });
      return;
    }

    updateNode(id, { status: "running", error: undefined });
    setGeneratedVideoUrl(null);
    setPromptBundle(null);

    try {
      const request: GenerateVideoRequest = {
        prompt: prompt.trim(),
        video_style: videoStyle || undefined,
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
        resolution,
        negative_prompt: negativePrompt || undefined,
      };

      // Attach selected images from bucket
      if (selectedImageIds.length > 0) {
        const imagePromises = selectedImageIds.map(async (imgId) => {
          const item = imageBucket.find((img) => img.id === imgId);
          if (!item) return null;
          return item.base64 || (await getImageBase64(item));
        });
        const images = (await Promise.all(imagePromises)).filter(
          (img): img is string => img !== null
        );
        if (images.length > 0) {
          request.images = images;
        }
      }

      const response = await generateVideo(request);

      if (!response.success) {
        throw new Error(response.error || "Generation failed");
      }

      if (response.video_url) {
        setGeneratedVideoUrl(response.video_url);
        setPromptBundle(response.prompt_bundle ?? null);
        updateNode(id, {
          status: "completed",
          outputs: {
            generated_video: response.video_url,
            prompt_bundle: response.prompt_bundle,
          },
        });
      } else {
        throw new Error("No video was generated");
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
      theme={nodeThemes.violet}
    >
      <div className="space-y-4">
        {/* Prompt — always visible as a configuration param */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to create..."
            className="nodrag w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-slate-400"
            rows={3}
          />
        </div>

        {/* Video Style Pills */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Video Style
          </label>
          <div className="flex flex-wrap gap-1.5">
            {VIDEO_STYLES.map((style) => {
              const isCustom = style.value === "__custom__";
              const isSelected = isCustom
                ? !VIDEO_STYLES.slice(0, -1).some(s => s.value === videoStyle) && videoStyle !== ""
                : videoStyle === style.value;
              return (
                <button
                  key={style.value}
                  onClick={() => {
                    if (isCustom) {
                      setVideoStyle(customStyle || "__custom__");
                    } else {
                      setVideoStyle(style.value);
                      setCustomStyle("");
                    }
                  }}
                  className={`
                    nodrag px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? "bg-violet-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }
                  `}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
          {/* Custom style text input */}
          {!VIDEO_STYLES.slice(0, -1).some(s => s.value === videoStyle) && videoStyle !== "" && (
            <input
              type="text"
              value={customStyle}
              onChange={(e) => {
                setCustomStyle(e.target.value);
                setVideoStyle(e.target.value || "__custom__");
              }}
              placeholder="Describe your video style..."
              className="nodrag w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-slate-400"
            />
          )}
        </div>

        {/* Aspect Ratio Pills */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Aspect Ratio
          </label>
          <div className="flex gap-1.5">
            {ASPECT_RATIOS.map((ratio) => {
              const Icon = ratio.icon;
              const isSelected = aspectRatio === ratio.value;
              return (
                <button
                  key={ratio.value}
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`
                    nodrag flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }
                  `}
                >
                  <Icon size={14} strokeWidth={isSelected ? 2.5 : 2} />
                  {ratio.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Duration Pills */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Duration
            </label>
            <span className="text-[10px] text-slate-400 font-medium">(max 60s)</span>
          </div>
          <div className="flex gap-1.5">
            {DURATIONS.map((d) => {
              const isCustom = d.value === "__custom__";
              const isSelected = isCustom
                ? !["8", "16"].includes(duration)
                : duration === d.value;
              return (
                <button
                  key={d.value}
                  onClick={() => {
                    if (isCustom) {
                      setDuration(customDuration || "10");
                    } else {
                      setDuration(d.value);
                      setCustomDuration("");
                    }
                  }}
                  className={`
                    nodrag px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }
                  `}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
          {/* Custom duration input */}
          {!["8", "16"].includes(duration) && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={customDuration || duration}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(60, Number(e.target.value) || 1));
                  setCustomDuration(String(val));
                  setDuration(String(val));
                }}
                className="nodrag w-20 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
              />
              <span className="text-xs text-slate-500">seconds</span>
            </div>
          )}
        </div>

        {/* Resolution Dropdown */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Resolution
          </label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="nodrag w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Negative Prompt (collapsible) */}
        <div>
          <button
            onClick={() => setShowNegativePrompt(!showNegativePrompt)}
            className="nodrag flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {showNegativePrompt ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
            Negative Prompt
          </button>
          {showNegativePrompt && (
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              placeholder="Describe what you don't want in the video..."
              className="nodrag mt-2 w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all placeholder:text-slate-400"
              rows={2}
            />
          )}
        </div>

        {/* Reference Images from Bucket — only in test mode */}
        {showManualInputs && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Reference Images
                </label>
                <span className="text-[10px] text-slate-400 font-medium">
                  Max 3
                </span>
              </div>
              {selectedImageIds.length > 0 && (
                <button
                  onClick={() => setSelectedImageIds([])}
                  className="text-[10px] text-slate-500 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Selected images preview */}
            {selectedImageIds.length > 0 && (
              <div className="flex gap-1.5">
                {selectedImageIds.map((imgId) => {
                  const item = imageBucket.find((img) => img.id === imgId);
                  if (!item) return null;
                  return (
                    <div
                      key={imgId}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-violet-300 cursor-pointer"
                      onClick={() => toggleImageSelection(imgId)}
                    >
                      <Image
                        src={getImageSrc(item)}
                        alt={item.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setShowImagePicker(!showImagePicker)}
              className={`
                nodrag w-full p-3 border border-dashed rounded-xl transition-all text-center
                ${showImagePicker
                  ? "border-violet-400 bg-violet-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                }
              `}
            >
              <div className="flex flex-col items-center gap-1.5">
                <ImageIcon
                  size={16}
                  className={showImagePicker ? "text-violet-500" : "text-slate-400"}
                />
                <span
                  className={`text-xs font-medium ${showImagePicker ? "text-violet-600" : "text-slate-600"}`}
                >
                  {imageBucket.length > 0
                    ? `Select images (${selectedImageIds.length}/3)`
                    : "No images in bucket"}
                </span>
              </div>
            </button>

            {showImagePicker && imageBucket.length > 0 && (
              <div className="nodrag grid grid-cols-4 gap-1.5 p-2 border border-slate-200 rounded-xl bg-white max-h-32 overflow-y-auto">
                {imageBucket.map((image: ImageBucketItem) => {
                  const isSelected = selectedImageIds.includes(image.id);
                  return (
                    <button
                      key={image.id}
                      onClick={() => toggleImageSelection(image.id)}
                      disabled={!isSelected && selectedImageIds.length >= 3}
                      className={`
                        relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                        ${isSelected
                          ? "border-violet-400 ring-2 ring-violet-200"
                          : selectedImageIds.length >= 3
                            ? "border-transparent opacity-40 cursor-not-allowed"
                            : "border-transparent hover:border-slate-300"
                        }
                      `}
                    >
                      <Image
                        src={getImageSrc(image)}
                        alt={image.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      {isSelected && (
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                          <Check size={10} className="text-white" strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Test Node Button */}
        {node?.manualInputEnabled && (
          <button
            onClick={handleExecute}
            disabled={node?.status === "running" || !prompt.trim()}
            className={`
              nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
              transition-all duration-200
              ${node?.status === "running" || !prompt.trim()
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-violet-600 text-white hover:bg-violet-700 shadow-md hover:shadow-lg"
              }
            `}
          >
            {node?.status === "running" ? "Generating..." : "Test Node"}
          </button>
        )}

        {/* Generated Video Result */}
        {generatedVideoUrl && node?.status === "completed" && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-gray-700">
                  Generated Video
                </span>
              </div>
              <button
                onClick={handleDownload}
                className="nodrag flex items-center gap-1 px-2 py-1 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors"
              >
                <Download size={12} />
                Download
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5">
              <video
                src={generatedVideoUrl}
                controls
                className="w-full"
                style={{ maxHeight: 240 }}
              />
            </div>

            {/* Generation Details (collapsible) */}
            {promptBundle && (
              <div>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="nodrag flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  {showDetails ? (
                    <ChevronUp size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  Generation Details
                </button>
                {showDetails && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-1.5">
                    {promptBundle.enhanced_prompt != null && (
                      <div>
                        <span className="font-semibold text-slate-700">Enhanced prompt: </span>
                        <span>{String(promptBundle.enhanced_prompt).slice(0, 200)}...</span>
                      </div>
                    )}
                    {promptBundle.preprocessing != null && (
                      <div>
                        <span className="font-semibold text-slate-700">Ref images used: </span>
                        <span>
                          {String(
                            (promptBundle.preprocessing as Record<string, unknown>)
                              ?.selected_image_count ?? 0
                          )}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-slate-700">Params: </span>
                      <span>
                        {aspectRatio} / {duration}s / {resolution}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </WorkflowNodeWrapper>
  );
}
