"use client";

import React, { useState, useEffect, useRef, ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";
import { getNodeSpec } from "@/lib/nodeRegistry";
import type { RuntimeType } from "@/types/blueprint";
import { CheckCircle2, Loader2, LucideIcon } from "lucide-react";
import { useWorkflowStore, NodeStatus } from "@/lib/stores/workflowStore";
import { listFiles, FileListItem } from "@/lib/fastapi/files";
import Image from "next/image";

export type BucketType = "image" | "audio" | "video" | "text";

export interface BucketNodeTheme {
  gradient: string;
  shadow: string;
  shadowHover: string;
  border: string;
  borderHover: string;
  iconBg: string;
  iconBgCompleted: string;
  ring: string;
  iconColor: string;
  titleColor: string;
  subtitleColor: string;
  buttonBorder: string;
  buttonText: string;
  pickerBorder: string;
  selectedBg: string;
  selectedBorder: string;
  selectedLabel: string;
  handleColor: string;
}

const BUCKET_THEMES: Record<BucketType, BucketNodeTheme> = {
  image: {
    gradient: "from-blue-50 to-blue-100",
    shadow: "rgba(59,130,246,0.15)",
    shadowHover: "rgba(59,130,246,0.25)",
    border: "border-blue-300",
    borderHover: "hover:border-blue-400",
    iconBg: "bg-blue-100",
    iconBgCompleted: "bg-blue-500",
    ring: "ring-blue-200/50",
    iconColor: "text-blue-600",
    titleColor: "text-blue-900",
    subtitleColor: "text-blue-600",
    buttonBorder: "border-blue-200",
    buttonText: "text-blue-700",
    pickerBorder: "border-blue-200",
    selectedBg: "bg-blue-100",
    selectedBorder: "border-blue-400",
    selectedLabel: "text-blue-700",
    handleColor: "#3b82f6",
  },
  audio: {
    gradient: "from-purple-50 to-purple-100",
    shadow: "rgba(168,85,247,0.15)",
    shadowHover: "rgba(168,85,247,0.25)",
    border: "border-purple-300",
    borderHover: "hover:border-purple-400",
    iconBg: "bg-purple-100",
    iconBgCompleted: "bg-purple-500",
    ring: "ring-purple-200/50",
    iconColor: "text-purple-600",
    titleColor: "text-purple-900",
    subtitleColor: "text-purple-600",
    buttonBorder: "border-purple-200",
    buttonText: "text-purple-700",
    pickerBorder: "border-purple-200",
    selectedBg: "bg-purple-100",
    selectedBorder: "border-purple-400",
    selectedLabel: "text-purple-700",
    handleColor: "#a855f7",
  },
  video: {
    gradient: "from-red-50 to-red-100",
    shadow: "rgba(239,68,68,0.15)",
    shadowHover: "rgba(239,68,68,0.25)",
    border: "border-red-300",
    borderHover: "hover:border-red-400",
    iconBg: "bg-red-100",
    iconBgCompleted: "bg-red-500",
    ring: "ring-red-200/50",
    iconColor: "text-red-600",
    titleColor: "text-red-900",
    subtitleColor: "text-red-600",
    buttonBorder: "border-red-200",
    buttonText: "text-red-700",
    pickerBorder: "border-red-200",
    selectedBg: "bg-red-100",
    selectedBorder: "border-red-400",
    selectedLabel: "text-red-700",
    handleColor: "#ef4444",
  },
  text: {
    gradient: "from-green-50 to-green-100",
    shadow: "rgba(34,197,94,0.15)",
    shadowHover: "rgba(34,197,94,0.25)",
    border: "border-green-300",
    borderHover: "hover:border-green-400",
    iconBg: "bg-green-100",
    iconBgCompleted: "bg-green-500",
    ring: "ring-green-200/50",
    iconColor: "text-green-600",
    titleColor: "text-green-900",
    subtitleColor: "text-green-600",
    buttonBorder: "border-green-200",
    buttonText: "text-green-700",
    pickerBorder: "border-green-200",
    selectedBg: "bg-green-100",
    selectedBorder: "border-green-400",
    selectedLabel: "text-green-700",
    handleColor: "#22c55e",
  },
};

const BUCKET_CONFIG: Record<BucketType, {
  title: string;
  outputHandle: string;
  selectButtonText: string;
  hideButtonText: string;
  emptyText: string;
}> = {
  image: {
    title: "Image Bucket",
    outputHandle: "images",
    selectButtonText: "Select Images",
    hideButtonText: "Hide Images",
    emptyText: "No images found",
  },
  audio: {
    title: "Audio Bucket",
    outputHandle: "audio",
    selectButtonText: "Select Audio Files",
    hideButtonText: "Hide Files",
    emptyText: "No audio files found",
  },
  video: {
    title: "Video Bucket",
    outputHandle: "videos",
    selectButtonText: "Select Video Files",
    hideButtonText: "Hide Files",
    emptyText: "No video files found",
  },
  text: {
    title: "Text Bucket",
    outputHandle: "text",
    selectButtonText: "Select Text Files",
    hideButtonText: "Hide Files",
    emptyText: "No text files found",
  },
};

interface BucketNodeBaseProps {
  id: string;
  bucketType: BucketType;
  icon: LucideIcon;
}

export function BucketNodeBase({ id, bucketType, icon: Icon }: BucketNodeBaseProps) {
  const theme = BUCKET_THEMES[bucketType];
  const config = BUCKET_CONFIG[bucketType];

  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const isRunning = node?.status === "running";
  const isCompleted = node?.status === "completed";

  // Track previous status for animations
  const prevStatusRef = useRef<NodeStatus | undefined>(undefined);
  const [justCompleted, setJustCompleted] = useState(false);

  // Detect status changes for animations
  useEffect(() => {
    const currentStatus = node?.status;
    const prevStatus = prevStatusRef.current;
    
    // Update previous status FIRST (before any early returns)
    prevStatusRef.current = currentStatus;
    
    // Trigger completion animation when status changes to completed
    if (currentStatus === 'completed' && prevStatus !== 'completed' && prevStatus !== undefined) {
      setJustCompleted(true);
      // Reset after animation completes
      const timer = setTimeout(() => setJustCompleted(false), 600);
      return () => clearTimeout(timer);
    }
  }, [node?.status]);

  const initialSelectedIds = Array.isArray(node?.inputs?.selected_file_ids)
    ? (node.inputs.selected_file_ids as string[])
    : [];

  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(initialSelectedIds)
  );
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Fetch files from storage - refetch when picker is opened and poll while open
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const fetchFiles = async (showLoadingSpinner = true) => {
      if (showLoadingSpinner) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const response = await listFiles({
          type: bucketType,
          status: "uploaded",
          includeUrls: true,
          limit: 100,
        });
        if (isMounted) {
          setFiles(response.items);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : `Failed to load ${bucketType} files`);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Fetch on mount or when picker opens
    if (showPicker || files.length === 0) {
      fetchFiles(true);
    }

    // Poll for new files while picker is open (every 2 seconds)
    if (showPicker) {
      intervalId = setInterval(() => {
        fetchFiles(false); // Don't show loading spinner for background refreshes
      }, 2000);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketType, showPicker]);

  // Sync selected IDs to node inputs
  useEffect(() => {
    const idsArray = Array.from(selectedFileIds);
    if (node) {
      const currentIds = Array.isArray(node?.inputs?.selected_file_ids)
        ? (node.inputs.selected_file_ids as string[])
        : [];

      if (JSON.stringify(currentIds.sort()) !== JSON.stringify(idsArray.sort())) {
        updateNode(id, {
          inputs: {
            ...node.inputs,
            selected_file_ids: idsArray,
          },
        });
      }
    }
  }, [selectedFileIds, id, updateNode, node]);

  const toggleFile = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));

  // Render file picker content based on bucket type
  const renderFilePickerContent = (): ReactNode => {
    if (files.length === 0) {
      return (
        <div className={bucketType === "image" ? "col-span-4 text-xs text-slate-500 text-center py-4" : "text-xs text-slate-500 text-center py-4"}>
          {config.emptyText}
        </div>
      );
    }

    if (bucketType === "image") {
      return files.map((file) => (
        <button
          key={file.id}
          onClick={() => toggleFile(file.id)}
          className={`
            relative aspect-square rounded-lg overflow-hidden border-2 transition-all
            ${selectedFileIds.has(file.id)
              ? `${theme.selectedBorder} ring-2 ring-blue-200`
              : "border-transparent hover:border-blue-300"
            }
          `}
        >
          {file.signedUrl && (
            <Image
              src={file.signedUrl}
              alt={file.name}
              fill
              className="object-cover"
              unoptimized
            />
          )}
          {selectedFileIds.has(file.id) && (
            <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
              <CheckCircle2 size={10} className="text-white" strokeWidth={3} />
            </div>
          )}
        </button>
      ));
    }

    // For audio, video, and text - render as list
    return files.map((file) => (
      <button
        key={file.id}
        onClick={() => toggleFile(file.id)}
        className={`
          w-full px-3 py-2 text-left rounded-lg transition-all flex items-center gap-2
          ${selectedFileIds.has(file.id)
            ? `${theme.selectedBg} border-2 ${theme.selectedBorder}`
            : "bg-slate-50 hover:bg-slate-100 border-2 border-transparent"
          }
        `}
      >
        <Icon size={16} className={theme.iconColor} />
        <span className="flex-1 text-xs font-medium text-slate-700 truncate">
          {file.name}
        </span>
        {selectedFileIds.has(file.id) && (
          <CheckCircle2 size={14} className={theme.iconColor} strokeWidth={2.5} />
        )}
      </button>
    ));
  };

  // Render selected files preview based on bucket type
  const renderSelectedFilesPreview = (): ReactNode => {
    if (selectedFiles.length === 0) return null;

    if (bucketType === "image") {
      return (
        <div className="space-y-1">
          <div className={`text-xs font-medium ${theme.selectedLabel}`}>
            Selected ({selectedFiles.length}):
          </div>
          <div className="grid grid-cols-4 gap-1">
            {selectedFiles.slice(0, 4).map((file) => (
              <div
                key={file.id}
                className={`relative aspect-square rounded overflow-hidden border ${theme.pickerBorder}`}
              >
                {file.signedUrl && (
                  <Image
                    src={file.signedUrl}
                    alt={file.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                )}
              </div>
            ))}
            {selectedFiles.length > 4 && (
              <div className={`relative aspect-square rounded border ${theme.pickerBorder} ${theme.selectedBg.replace('bg-', 'bg-').replace('-100', '-50')} flex items-center justify-center`}>
                <span className={`text-xs font-medium ${theme.subtitleColor}`}>
                  +{selectedFiles.length - 4}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }

    // For audio, video, and text - render as list
    return (
      <div className="space-y-1">
        <div className={`text-xs font-medium ${theme.selectedLabel}`}>
          Selected ({selectedFiles.length}):
        </div>
        <div className="space-y-1 max-h-24 overflow-y-auto">
          {selectedFiles.map((file) => (
            <div
              key={file.id}
              className="text-xs text-slate-600 bg-white/60 px-2 py-1 rounded truncate"
            >
              {file.name}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Build container class based on bucket type (using static classes for Tailwind)
  const containerClasses = {
    image: "bg-gradient-to-br from-blue-50 via-blue-50/50 to-blue-100/80 border-blue-300 shadow-[0_4px_16px_-4px_rgba(59,130,246,0.2)] hover:shadow-[0_12px_40px_-8px_rgba(59,130,246,0.3)] hover:border-blue-400",
    audio: "bg-gradient-to-br from-purple-50 via-purple-50/50 to-purple-100/80 border-purple-300 shadow-[0_4px_16px_-4px_rgba(168,85,247,0.2)] hover:shadow-[0_12px_40px_-8px_rgba(168,85,247,0.3)] hover:border-purple-400",
    video: "bg-gradient-to-br from-red-50 via-red-50/50 to-red-100/80 border-red-300 shadow-[0_4px_16px_-4px_rgba(239,68,68,0.2)] hover:shadow-[0_12px_40px_-8px_rgba(239,68,68,0.3)] hover:border-red-400",
    text: "bg-gradient-to-br from-green-50 via-green-50/50 to-green-100/80 border-green-300 shadow-[0_4px_16px_-4px_rgba(34,197,94,0.2)] hover:shadow-[0_12px_40px_-8px_rgba(34,197,94,0.3)] hover:border-green-400",
  };

  return (
    <div
      className={`
        relative
        rounded-2xl
        border-2
        min-w-[200px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:-translate-y-1
        ${containerClasses[bucketType]}
        ${isRunning ? "animate-running-glow" : ""}
        ${justCompleted ? "animate-node-complete" : ""}
      `}
    >
      <div className="px-5 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className={`
              p-2.5 rounded-xl
              ${isCompleted ? theme.iconBgCompleted : theme.iconBg}
              shadow-md ring-1 ring-inset ${theme.ring}
              transition-all duration-300
              ${isCompleted ? 'scale-105' : ''}
            `}
          >
            {isCompleted ? (
              <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
            ) : (
              <Icon size={20} className={theme.iconColor} strokeWidth={2.5} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-[15px] ${theme.titleColor} leading-tight`}>
              {config.title}
            </h3>
            <p className={`text-[11px] ${theme.subtitleColor} mt-0.5 font-medium`}>
              {selectedFileIds.size} {selectedFileIds.size === 1 ? 'file' : 'files'} selected
            </p>
          </div>
        </div>

        {/* File picker */}
        <div className="space-y-2">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className={`w-full px-3 py-2 text-sm bg-white/90 hover:bg-white border ${theme.buttonBorder} rounded-lg ${theme.buttonText} font-medium transition-all hover:shadow-sm active:scale-[0.98]`}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </span>
            ) : showPicker ? (
              config.hideButtonText
            ) : (
              config.selectButtonText
            )}
          </button>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}

          {showPicker && !isLoading && (
            <div className={`nodrag ${bucketType === "image" ? "grid grid-cols-4 gap-1.5" : "space-y-1"} p-2 border ${theme.pickerBorder} rounded-xl bg-white max-h-48 overflow-y-auto`}>
              {renderFilePickerContent()}
            </div>
          )}

          {renderSelectedFilesPreview()}
        </div>
      </div>

      {/* Output handle */}
      {(() => {
        // Map bucketType to node type string
        const nodeTypeMap: Record<BucketType, string> = {
          image: 'ImageBucket',
          audio: 'AudioBucket',
          video: 'VideoBucket',
          text: 'TextBucket',
        };
        
        const nodeType = nodeTypeMap[bucketType];
        
        // Get the actual data type color from node registry
        const nodeSpec = getNodeSpec(nodeType);
        const outputPort = nodeSpec?.outputs.find(p => p.key === config.outputHandle);
        const runtimeType = outputPort?.runtime_type;
        
        // Color mapping for data types (matches edge colors)
        const DATA_TYPE_COLORS: Record<RuntimeType, string> = {
          Text: '#10b981', // emerald-500
          ImageRef: '#3b82f6', // blue-500
          AudioRef: '#8b5cf6', // violet-500
          VideoRef: '#ec4899', // pink-500
          JSON: '#f59e0b', // amber-500
        };
        
        const handleColor = runtimeType && DATA_TYPE_COLORS[runtimeType] 
          ? DATA_TYPE_COLORS[runtimeType] 
          : theme.handleColor; // fallback to theme color
        
        return (
          <Handle
            type="source"
            position={Position.Right}
            id={config.outputHandle}
            style={{
              background: handleColor,
              width: 14,
              height: 14,
              border: "3px solid white",
              boxShadow: `0 2px 8px ${handleColor}66`,
              right: -7,
            }}
            className="hover:scale-125 transition-transform"
          />
        );
      })()}
    </div>
  );
}
