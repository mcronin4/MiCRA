"use client";

import React, { useState, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore, ImageBucketItem } from "@/lib/stores/workflowStore";
import {
  generateImage,
  GenerateImageRequest,
} from "@/lib/fastapi/image-generation";
import { getImageBase64, getImageSrc } from "@/lib/utils/imageUtils";
import { NodeConfig } from "@/types/workflow";
import {
  Image as ImageIcon,
  Download,
  RectangleHorizontal,
  Square,
  RectangleVertical,
  Check,
} from "lucide-react";
import Image from "next/image";
import { useNodeConnections } from "@/hooks/useNodeConnections";

// Config for this node type
const config: NodeConfig = {
  type: "image-generation",
  label: "Image Generation",
  description: "Create stunning images with AI",
  inputs: [
    { id: "prompt", label: "Prompt", type: "string" },
    { id: "image", label: "Reference Image", type: "image" },
  ],
  outputs: [{ id: "generated_image", label: "Generated Image", type: "image" }],
};

const ASPECT_RATIOS = [
  { value: "1:1", label: "Square", icon: Square },
  { value: "16:9", label: "Landscape", icon: RectangleHorizontal },
  { value: "9:16", label: "Portrait", icon: RectangleVertical },
  { value: "4:3", label: "Standard", icon: RectangleHorizontal },
  { value: "3:4", label: "Tall", icon: RectangleVertical },
];

export function ImageGenerationNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const imageBucket = useWorkflowStore((state) => state.imageBucket);
  const { hasConnections } = useNodeConnections(id);

  // Determine if manual inputs should be shown
  // Only show manual inputs when test mode is enabled
  const showManualInputs = node?.manualInputEnabled ?? false;

  const initialPrompt =
    typeof node?.inputs?.prompt === "string" ? node.inputs.prompt : "";
  const initialAspectRatio =
    typeof node?.inputs?.aspect_ratio === "string"
      ? node.inputs.aspect_ratio
      : "1:1";
  const initialSelectedImageId =
    typeof node?.inputs?.selectedImageId === "string"
      ? node.inputs.selectedImageId
      : null;

  const [prompt, setPrompt] = useState<string>(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    initialSelectedImageId,
  );
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // Clear outputs when test mode is disabled
  useEffect(() => {
    if (!node?.manualInputEnabled && hasConnections) {
      setGeneratedImage(null);
      updateNode(id, { outputs: null, status: "idle" });
    }
  }, [node?.manualInputEnabled, hasConnections, id, updateNode]);

  // Get selected reference image from bucket
  const selectedImage: ImageBucketItem | undefined = imageBucket.find(
    (img) => img.id === selectedImageId,
  );

  useEffect(() => {
    if (
      node &&
      (node.inputs.prompt !== prompt ||
        node.inputs.aspect_ratio !== aspectRatio ||
        node.inputs.selectedImageId !== selectedImageId)
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          prompt,
          aspect_ratio: aspectRatio,
          selectedImageId: selectedImageId,
        },
      });
    }
  }, [prompt, aspectRatio, selectedImageId, id, updateNode, node]);

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `generated-image-${Date.now()}.png`;
    link.click();
  };

  const handleExecute = async () => {
    if (!prompt.trim()) {
      updateNode(id, { status: "error", error: "Please enter a prompt" });
      return;
    }

    updateNode(id, { status: "running", error: undefined });
    setGeneratedImage(null);

    try {
      const request: GenerateImageRequest = {
        prompt: prompt.trim(),
        aspect_ratio: aspectRatio,
      };

      if (selectedImage) {
        // Get base64 from signedUrl if needed
        const base64 = selectedImage.base64 || await getImageBase64(selectedImage);
        request.input_image = base64;
      }

      const response = await generateImage(request);

      if (!response.success) {
        throw new Error(response.error || "Generation failed");
      }

      if (response.image_base64) {
        setGeneratedImage(response.image_base64);
        updateNode(id, {
          status: "completed",
          outputs: { generated_image: response.image_base64 },
          inputs: {
            prompt,
            aspect_ratio: aspectRatio,
            selectedImageId: selectedImageId,
          },
        });
      } else {
        throw new Error("No image was generated");
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
      theme={nodeThemes.indigo}
    >
      <div className="space-y-4">
        {/* Prompt Section - only show in test mode */}
        {showManualInputs && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your image..."
              className="nodrag w-full px-3.5 py-3 text-sm border border-slate-200 rounded-xl resize-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all placeholder:text-slate-400"
              rows={3}
            />
          </div>
        )}

        {/* Aspect Ratio Pills - always show as it's a configuration, not an input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
            Aspect Ratio
          </label>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_RATIOS.map((ratio) => {
              const Icon = ratio.icon;
              const isSelected = aspectRatio === ratio.value;
              return (
                <button
                  key={ratio.value}
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`
                    nodrag flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${
                      isSelected
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

        {/* Reference Image from Bucket */}
        {showManualInputs && (
          <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                Reference Image
              </label>
              <span className="text-[10px] text-slate-400 font-medium">
                Optional
              </span>
            </div>
            {selectedImage && (
              <button
                onClick={() => setSelectedImageId(null)}
                className="text-[10px] text-slate-500 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {/* Selected image or picker button */}
          {selectedImage ? (
            <div
              onClick={() => setShowImagePicker(!showImagePicker)}
              className="nodrag relative rounded-xl overflow-hidden cursor-pointer group border border-slate-200"
            >
              <Image
                src={getImageSrc(selectedImage)}
                alt={selectedImage.name}
                width={280}
                height={140}
                className="w-full h-28 object-cover"
                unoptimized
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-2 py-1 rounded-full">
                  Click to change
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowImagePicker(!showImagePicker)}
              className={`
                nodrag w-full p-4 border border-dashed rounded-xl transition-all
                ${
                  showImagePicker
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                }
              `}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <div
                  className={`p-2 rounded-lg ${showImagePicker ? "bg-indigo-100" : "bg-slate-100"}`}
                >
                  <ImageIcon
                    size={18}
                    className={
                      showImagePicker ? "text-indigo-500" : "text-slate-400"
                    }
                  />
                </div>
                <span
                  className={`text-sm font-medium ${showImagePicker ? "text-indigo-600" : "text-slate-600"}`}
                >
                  {imageBucket.length > 0
                    ? "Select from bucket"
                    : "No images in bucket"}
                </span>
              </div>
            </button>
          )}

          {/* Image picker dropdown */}
          {showImagePicker && imageBucket.length > 0 && (
            <div className="nodrag grid grid-cols-4 gap-1.5 p-2 border border-slate-200 rounded-xl bg-white max-h-32 overflow-y-auto">
              {imageBucket.map((image) => (
                <button
                  key={image.id}
                  onClick={() => {
                    setSelectedImageId(image.id);
                    setShowImagePicker(false);
                  }}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                    ${
                      selectedImageId === image.id
                        ? "border-indigo-400 ring-2 ring-indigo-200"
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
                  {selectedImageId === image.id && (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          </div>
        )}
        
        {/* Test Node button - show when test mode is enabled */}
        {node?.manualInputEnabled && (
          <button
            onClick={handleExecute}
            disabled={node?.status === "running" || !prompt.trim()}
            className={`
              nodrag w-full px-4 py-2.5 rounded-xl font-semibold text-sm
              transition-all duration-200
              ${
                node?.status === "running" || !prompt.trim()
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg"
              }
            `}
          >
            {node?.status === "running" ? "Running..." : "Test Node"}
          </button>
        )}

        {/* Generated Image Result */}
        {generatedImage && node?.status === "completed" && (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-gray-700">
                  Generated Image
                </span>
              </div>
              <button
                onClick={handleDownload}
                className="nodrag flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <Download size={12} />
                Download
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden shadow-lg ring-1 ring-black/5">
              <Image
                src={generatedImage}
                alt="Generated image"
                width={280}
                height={280}
                className="w-full"
                unoptimized
              />
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          </div>
        )}
      </div>
    </WorkflowNodeWrapper>
  );
}
