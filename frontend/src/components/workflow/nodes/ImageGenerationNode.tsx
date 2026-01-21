"use client";

import React, { useState, useRef, useEffect } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import {
  generateImage,
  fileToBase64,
  GenerateImageRequest,
} from "@/lib/fastapi/image-generation";
import { NodeConfig } from "@/types/workflow";
import {
  X,
  Upload,
  Sparkles,
  Image as ImageIcon,
  Download,
  RectangleHorizontal,
  Square,
  RectangleVertical,
} from "lucide-react";
import Image from "next/image";

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

  const initialPrompt =
    typeof node?.inputs?.prompt === "string" ? node.inputs.prompt : "";
  const initialAspectRatio =
    typeof node?.inputs?.aspect_ratio === "string"
      ? node.inputs.aspect_ratio
      : "1:1";
  const initialInputImage =
    typeof node?.inputs?.input_image === "string"
      ? node.inputs.input_image
      : "";

  const [prompt, setPrompt] = useState<string>(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<string>(initialAspectRatio);
  const [inputImage, setInputImage] = useState<string>(initialInputImage);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (
      node &&
      (node.inputs.prompt !== prompt ||
        node.inputs.aspect_ratio !== aspectRatio ||
        node.inputs.input_image !== inputImage)
    ) {
      updateNode(id, {
        inputs: {
          ...node.inputs,
          prompt,
          aspect_ratio: aspectRatio,
          input_image: inputImage,
        },
      });
    }
  }, [prompt, aspectRatio, inputImage, id, updateNode, node]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const base64 = await fileToBase64(e.target.files[0]);
      setInputImage(base64);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0 && droppedFiles[0].type.startsWith("image/")) {
      const base64 = await fileToBase64(droppedFiles[0]);
      setInputImage(base64);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const removeImage = () => {
    setInputImage("");
  };

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

      if (inputImage) {
        request.input_image = inputImage;
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
            input_image: inputImage,
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
        {/* Prompt Section */}
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

        {/* Aspect Ratio Pills */}
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

        {/* Reference Image Upload */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Reference Image
            </label>
            <span className="text-[10px] text-slate-400 font-medium">
              Optional
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          <div
            onClick={handleClick}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              nodrag relative w-full border border-dashed rounded-xl transition-all duration-200 cursor-pointer overflow-hidden
              ${
                isDragging
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
              }
              ${inputImage ? "p-0" : "p-6"}
            `}
          >
            {!inputImage ? (
              <div className="flex flex-col items-center justify-center text-center">
                <div
                  className={`p-2.5 rounded-xl mb-2 ${
                    isDragging ? "bg-indigo-100" : "bg-slate-100"
                  }`}
                >
                  <Upload
                    size={20}
                    strokeWidth={1.5}
                    className={
                      isDragging ? "text-indigo-500" : "text-slate-400"
                    }
                  />
                </div>
                <p
                  className={`text-sm font-medium ${
                    isDragging ? "text-indigo-600" : "text-slate-600"
                  }`}
                >
                  {isDragging ? "Drop image here" : "Drop or click to upload"}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  For style reference or editing
                </p>
              </div>
            ) : (
              <div className="relative group">
                <Image
                  src={inputImage}
                  alt="Reference image"
                  width={280}
                  height={140}
                  className="w-full h-36 object-cover"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage();
                  }}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                  aria-label="Remove image"
                >
                  <X size={12} />
                </button>
                <div className="absolute bottom-2 left-2 right-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-black/50 px-2 py-1 rounded-full">
                    Click to change
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

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
