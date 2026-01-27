"use client";

import React, { useEffect, useRef, useState } from "react";
import { NodeProps } from "@xyflow/react";
import { WorkflowNodeWrapper, nodeThemes } from "../WorkflowNodeWrapper";
import { useWorkflowStore } from "@/lib/stores/workflowStore";
import { transcribeFile, transcribeUrl } from "@/lib/fastapi/transcription";
import { NodeConfig } from "@/types/workflow";
import { Upload, Link, X, Mic } from "lucide-react";

const config: NodeConfig = {
  type: "transcription",
  label: "Transcription",
  description: "Transcribe audio or video from file or YouTube URL",
  inputs: [
    { id: "video", label: "Video File", type: "file" },
    { id: "url", label: "YouTube URL", type: "string" },
  ],
  outputs: [{ id: "transcript", label: "Transcript", type: "json" }],
};

type SourceType = "file" | "url";

export function TranscriptionNode({ id }: NodeProps) {
  const node = useWorkflowStore((state) => state.nodes[id]);
  const updateNode = useWorkflowStore((state) => state.updateNode);

  const initialSourceType: SourceType =
    node?.inputs?.source_type === "url" ? "url" : "file";
  const initialUrl =
    typeof node?.inputs?.url === "string" ? node.inputs.url : "";
  const initialFileName =
    typeof node?.inputs?.file_name === "string" ? node.inputs.file_name : "";
  const initialSegments = Array.isArray(node?.outputs?.transcript)
    ? (node?.outputs?.transcript as Array<{ start: number; end: number; text: string }>)
    : [];

  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType);
  const [videoUrl, setVideoUrl] = useState<string>(initialUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>(initialFileName);
  const [segments, setSegments] = useState<
    Array<{ start: number; end: number; text: string }>
  >(initialSegments);
  const [isDragging, setIsDragging] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isRunning = node?.status === "running";

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

  const handleExecute = async () => {
    updateNode(id, { status: "running", error: undefined });
    setSegments([]);

    try {
      if (sourceType === "url") {
        if (!videoUrl.trim()) {
          throw new Error("Please enter a YouTube URL");
        }
        const response = await transcribeUrl(videoUrl.trim());
        if (!response.success) {
          throw new Error(response.error || response.detail || "Transcription failed");
        }
        const nextSegments = response.segments || [];
        setSegments(nextSegments);
        updateNode(id, {
          status: "completed",
          outputs: { transcript: nextSegments },
          inputs: {
            source_type: sourceType,
            url: videoUrl,
            file_name: "",
          },
        });
      } else {
        if (!selectedFile) {
          throw new Error("Please upload a file");
        }
        const response = await transcribeFile(selectedFile);
        if (!response.success) {
          throw new Error(response.error || response.detail || "Transcription failed");
        }
        const nextSegments = response.segments || [];
        setSegments(nextSegments);
        updateNode(id, {
          status: "completed",
          outputs: { transcript: nextSegments },
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
      theme={nodeThemes.teal}
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
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            Upload File
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
                ? "bg-teal-600 text-white shadow-sm"
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
                className="nodrag w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-all"
              />
            </div>
          </div>
        )}

        {sourceType === "file" && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
              Audio/Video File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
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
                    ? "border-teal-400 bg-teal-50 ring-2 ring-teal-200"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                }
                ${isRunning ? "opacity-60 cursor-not-allowed" : ""}
              `}
            >
              <div className="flex flex-col items-center justify-center text-center py-4">
                <div
                  className={`p-2.5 rounded-lg mb-2 ${
                    isDragging
                      ? "bg-teal-100 text-teal-600"
                      : "bg-white text-slate-400 shadow-sm border border-slate-100"
                  }`}
                >
                  <Upload size={18} strokeWidth={2} />
                </div>
                <p
                  className={`text-sm font-medium ${
                    isDragging ? "text-teal-700" : "text-slate-700"
                  }`}
                >
                  {fileName ? fileName : "Drag & drop file here"}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  or click to browse (audio/video)
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

        {segments.length > 0 ? (
          <div
            className="nodrag border border-slate-200 rounded-xl bg-white p-3 cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setShowTranscript(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                setShowTranscript(true);
              }
            }}
            aria-label="Open transcript"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wide">
                Transcript
              </span>
              <span>{segments.length} segments</span>
            </div>
            <div className="space-y-1 text-xs text-slate-600">
              {segments.slice(0, 2).map((seg, index) => {
                const minutes = Math.floor(seg.start / 60);
                const seconds = Math.floor(seg.start % 60);
                const timeStr = `[${minutes.toString().padStart(2, "0")}:${seconds
                  .toString()
                  .padStart(2, "0")}]`;
                return (
                  <p
                    key={`${seg.start}-${index}`}
                    className="truncate max-w-[260px]"
                  >
                    <span className="text-slate-400 mr-2">{timeStr}</span>
                    {seg.text}
                  </p>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              Click to expand full transcript
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
            <div className="p-2.5 rounded-xl bg-slate-100 w-fit mx-auto mb-2">
              <Mic size={18} className="text-slate-400" />
            </div>
            <p className="text-xs font-medium text-slate-600">
              No transcript yet
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Run transcription to generate segments
            </p>
          </div>
        )}
      </div>

      {showTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setShowTranscript(false)}
            aria-hidden="true"
          />
          <div
            className="nodrag relative w-[90vw] max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  Transcript
                </h4>
                <p className="text-xs text-slate-500">
                  {segments.length} segments
                </p>
              </div>
              <button
                type="button"
                className="nodrag p-2 rounded-full hover:bg-slate-100 transition-colors"
                onClick={() => setShowTranscript(false)}
                aria-label="Close transcript"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(85vh-72px)] space-y-2 text-xs text-slate-600">
              {segments.map((seg, index) => {
                const minutes = Math.floor(seg.start / 60);
                const seconds = Math.floor(seg.start % 60);
                const timeStr = `[${minutes.toString().padStart(2, "0")}:${seconds
                  .toString()
                  .padStart(2, "0")}]`;
                return (
                  <p key={`${seg.start}-${index}`}>
                    <span className="text-slate-400 mr-2">{timeStr}</span>
                    {seg.text}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </WorkflowNodeWrapper>
  );
}
