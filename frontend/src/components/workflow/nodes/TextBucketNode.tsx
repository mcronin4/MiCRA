"use client";

import React, { useState, useEffect } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { FileText, CheckCircle2, Loader2 } from "lucide-react";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { listFiles, FileListItem } from "@/lib/fastapi/files";

export function TextBucketNode({ id }: NodeProps) {
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

  // Fetch text files from storage
  useEffect(() => {
    const fetchFiles = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await listFiles({
          type: "text",
          status: "uploaded",
          includeUrls: true,
          limit: 100,
        });
        setFiles(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load text files");
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
        bg-gradient-to-br from-green-50 to-green-100
        rounded-2xl
        shadow-[0_2px_12px_-4px_rgba(34,197,94,0.15)]
        border-2 border-green-300
        min-w-[200px]
        overflow-visible
        transition-all duration-300 ease-out
        hover:shadow-[0_8px_30px_-8px_rgba(34,197,94,0.25)]
        hover:border-green-400
        hover:-translate-y-1
        ${isRunning ? "animate-pulse" : ""}
      `}
    >
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`
              p-2.5 rounded-xl 
              ${isCompleted ? "bg-green-500" : "bg-green-100"}
              shadow-sm ring-1 ring-inset ring-green-200/50
              transition-colors duration-300
            `}
          >
            {isCompleted ? (
              <CheckCircle2 size={20} className="text-white" strokeWidth={2.5} />
            ) : (
              <FileText
                size={20}
                className="text-green-600"
                strokeWidth={2.5}
              />
            )}
          </div>
          <div>
            <h3 className="font-bold text-[15px] text-green-900 leading-tight">
              Text Bucket
            </h3>
            <p className="text-[11px] text-green-600 mt-0.5 font-medium">
              {selectedFileIds.size} selected
            </p>
          </div>
        </div>

        {/* File picker */}
        <div className="space-y-2">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-full px-3 py-2 text-sm bg-white/80 hover:bg-white border border-green-200 rounded-lg text-green-700 font-medium transition-colors"
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
              "Select Text Files"
            )}
          </button>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
              {error}
            </div>
          )}

          {showPicker && !isLoading && (
            <div className="nodrag max-h-48 overflow-y-auto space-y-1 p-2 border border-green-200 rounded-xl bg-white">
              {files.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-4">
                  No text files found
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
                          ? "bg-green-100 border-2 border-green-400"
                          : "bg-slate-50 hover:bg-slate-100 border-2 border-transparent"
                      }
                    `}
                  >
                    <FileText size={16} className="text-green-600" />
                    <span className="flex-1 text-xs font-medium text-slate-700 truncate">
                      {file.name}
                    </span>
                    {selectedFileIds.has(file.id) && (
                      <CheckCircle2 size={14} className="text-green-600" strokeWidth={2.5} />
                    )}
                  </button>
                ))
              )}
            </div>
          )}

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-green-700">
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
        id="text"
        style={{
          background: "#22c55e",
          width: 14,
          height: 14,
          border: "3px solid white",
          boxShadow: "0 2px 8px rgba(34,197,94,0.4)",
          right: -7,
        }}
        className="hover:scale-125 transition-transform"
      />
    </div>
  );
}

