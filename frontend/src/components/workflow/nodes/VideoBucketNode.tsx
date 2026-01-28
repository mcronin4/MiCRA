"use client";

import React, { useState, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { Video, CheckCircle2, Loader2 } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { listFiles, FileListItem } from "@/lib/fastapi/files";

export function VideoBucketNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);
  const isRunning = node?.status === "running";
  const isCompleted = node?.status === "completed";

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

  // Fetch video files from storage
  useEffect(() => {
    const fetchFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listFiles({
          type: "video",
          status: "uploaded",
          includeUrls: true,
          limit: 100,
        });
        setFiles(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video files");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFiles();
  }, []);

  // Sync selected IDs to node inputs
  useEffect(() => {
    const idsArray = Array.from(selectedFileIds);
    if (node) {
      const currentIds = Array.isArray(node?.inputs?.selected_file_ids)
        ? (node.inputs.selected_file_ids as string[])
        : [];
      
      // Only update if the IDs have actually changed
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

  return (
    <div
      className={`
        relative
        bg-gradient-to-br from-red-50 to-red-100
        rounded-2xl
        shadow-[0_2px_12px_-4px_rgba(239,68,68,0.15)]
        border-2 border-red-300
        min-w-[200px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_30px_-8px_rgba(239,68,68,0.25)]
        hover:border-red-400
        hover:-translate-y-1
        ${isRunning ? "animate-pulse" : ""}
      `}
    >
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`
              p-2.5 rounded-xl 
              ${isCompleted ? "bg-red-500" : "bg-red-100"}
              shadow-sm ring-1 ring-inset ring-red-200/50
              transition-colors duration-300
            `}
          >
            {isCompleted ? (
              <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
            ) : (
              <Video
                size={20}
                className="text-red-600"
                strokeWidth={2.5}
              />
            )}
          </div>
          <div>
            <h3 className="font-bold text-[15px] text-red-900 leading-tight">
              Video Bucket
            </h3>
            <p className="text-[11px] text-red-600 mt-0.5 font-medium">
              {selectedFileIds.size} selected
            </p>
          </div>
        </div>

        {/* File picker */}
        <div className="space-y-2">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-full px-3 py-2 text-sm bg-white/80 hover:bg-white border border-red-200 rounded-lg text-red-700 font-medium transition-colors"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Loading...
              </span>
            ) : showPicker ? (
              "Hide Files"
            ) : (
              "Select Video Files"
            )}
          </button>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}

          {showPicker && !isLoading && (
            <div className="nodrag max-h-48 overflow-y-auto space-y-1 p-2 border border-red-200 rounded-xl bg-white">
              {files.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-4">
                  No video files found
                </div>
              ) : (
                files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => toggleFile(file.id)}
                    className={`
                      w-full px-3 py-2 text-left rounded-lg transition-all flex items-center gap-2
                      ${
                        selectedFileIds.has(file.id)
                          ? "bg-red-100 border-2 border-red-400"
                          : "bg-slate-50 hover:bg-slate-100 border-2 border-transparent"
                      }
                    `}
                  >
                    <Video size={16} className="text-red-600" />
                    <span className="flex-1 text-xs font-medium text-slate-700 truncate">
                      {file.name}
                    </span>
                    {selectedFileIds.has(file.id) && (
                      <CheckCircle2 size={14} className="text-red-600" strokeWidth={2.5} />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-red-700">
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
          )}
        </div>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="videos"
        style={{
          background: "#ef4444",
          width: 14,
          height: 14,
          border: "3px solid white",
          boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
          right: -7,
        }}
        className="hover:scale-125 transition-transform"
      />
    </div>
  );
}

