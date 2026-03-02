"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, Loader2, LucideIcon, Play, Music, FileText } from "lucide-react";
import Image from "next/image";
import type { BucketType, BucketNodeTheme } from "./BucketNodeBase";
import type { FileListItem } from "@/lib/fastapi/files";

interface FilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: Set<string>, selectedFiles: FileListItem[]) => void;
  bucketType: BucketType;
  files: FileListItem[];
  initialSelectedIds: Set<string>;
  isLoading: boolean;
  theme: BucketNodeTheme;
  icon: LucideIcon;
  title: string;
}

const BUCKET_MODAL_TITLES: Record<BucketType, string> = {
  image: "Select Images",
  video: "Select Videos",
  audio: "Select Audio Files",
  text: "Select Text Files",
};

export function FilePickerModal({
  isOpen,
  onClose,
  onConfirm,
  bucketType,
  files,
  initialSelectedIds,
  isLoading,
  theme,
  icon: Icon,
  title,
}: FilePickerModalProps) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(initialSelectedIds));

  // Sync when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSelected(new Set(initialSelectedIds));
    }
  }, [isOpen, initialSelectedIds]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const toggleFile = useCallback((fileId: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const selectedFiles = files.filter((f) => localSelected.has(f.id));
    onConfirm(localSelected, selectedFiles);
  }, [localSelected, files, onConfirm]);

  const selectAll = useCallback(() => {
    setLocalSelected(new Set(files.map((f) => f.id)));
  }, [files]);

  const deselectAll = useCallback(() => {
    setLocalSelected(new Set());
  }, []);

  if (!isOpen) return null;

  const modalTitle = BUCKET_MODAL_TITLES[bucketType] || title;

  // ─── Image Gallery ───────────────────────────────────────────
  const renderImageGallery = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
      {files.map((file) => {
        const isSelected = localSelected.has(file.id);
        return (
          <button
            key={file.id}
            onClick={() => toggleFile(file.id)}
            className={`
              relative aspect-square rounded-xl overflow-hidden border-3 transition-all duration-200
              group cursor-pointer
              ${isSelected
                ? "border-blue-500 ring-3 ring-blue-200 shadow-lg shadow-blue-100 scale-[0.97]"
                : "border-transparent hover:border-slate-300 hover:shadow-md"
              }
            `}
          >
            {file.signedUrl ? (
              <Image
                src={file.signedUrl}
                alt={file.name}
                fill
                className="object-cover transition-transform duration-200 group-hover:scale-105"
                unoptimized
              />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                <Icon size={32} className="text-slate-300" />
              </div>
            )}
            {/* Hover overlay */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${isSelected ? "bg-blue-500/10" : "bg-black/0 group-hover:bg-black/10"}`} />
            {/* Check badge */}
            {isSelected && (
              <div className="absolute top-2 right-2 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-in zoom-in-50 duration-150">
                <CheckCircle2 size={16} className="text-white" strokeWidth={3} />
              </div>
            )}
            {/* File name tooltip */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <p className="text-white text-xs font-medium truncate">{file.name}</p>
            </div>
          </button>
        );
      })}
    </div>
  );

  // ─── Video Gallery ───────────────────────────────────────────
  const renderVideoGallery = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4">
      {files.map((file) => {
        const isSelected = localSelected.has(file.id);
        return (
          <button
            key={file.id}
            onClick={() => toggleFile(file.id)}
            className={`
              relative aspect-video rounded-xl overflow-hidden border-3 transition-all duration-200
              group cursor-pointer
              ${isSelected
                ? "border-amber-500 ring-3 ring-amber-200 shadow-lg shadow-amber-100 scale-[0.97]"
                : "border-transparent hover:border-slate-300 hover:shadow-md"
              }
            `}
          >
            {file.signedUrl ? (
              <video
                src={file.signedUrl}
                className="w-full h-full object-cover"
                preload="metadata"
                muted
              />
            ) : (
              <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                <Play size={32} className="text-slate-300" />
              </div>
            )}
            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${isSelected ? "bg-amber-500/80" : "bg-black/40 group-hover:bg-black/60"
                }`}>
                <Play size={20} className="text-white ml-0.5" fill="white" />
              </div>
            </div>
            {/* Check badge */}
            {isSelected && (
              <div className="absolute top-2 right-2 w-7 h-7 bg-amber-500 rounded-full flex items-center justify-center shadow-md animate-in zoom-in-50 duration-150">
                <CheckCircle2 size={16} className="text-white" strokeWidth={3} />
              </div>
            )}
            {/* File name */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-white text-sm font-medium truncate">{file.name}</p>
            </div>
          </button>
        );
      })}
    </div>
  );

  // ─── Audio List ──────────────────────────────────────────────
  const renderAudioList = () => (
    <div className="flex flex-col gap-2 p-4">
      {files.map((file) => {
        const isSelected = localSelected.has(file.id);
        return (
          <button
            key={file.id}
            onClick={() => toggleFile(file.id)}
            className={`
              w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200
              ${isSelected
                ? "bg-purple-50 border-2 border-purple-400 shadow-sm"
                : "bg-white border-2 border-slate-100 hover:border-purple-200 hover:bg-purple-50/30"
              }
            `}
          >
            <div className={`p-2.5 rounded-lg ${isSelected ? "bg-purple-100" : "bg-slate-50"}`}>
              <Music size={20} className={isSelected ? "text-purple-600" : "text-slate-400"} />
            </div>
            <span className={`flex-1 text-left text-sm font-medium truncate ${isSelected ? "text-purple-900" : "text-slate-700"}`}>
              {file.name}
            </span>
            {file.sizeBytes && (
              <span className="text-xs text-slate-400 shrink-0">
                {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
              </span>
            )}
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${isSelected ? "bg-purple-500 border-purple-500" : "border-slate-300"
              }`}>
              {isSelected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );

  // ─── Text List ───────────────────────────────────────────────
  const renderTextList = () => (
    <div className="flex flex-col gap-2 p-4">
      {files.map((file) => {
        const isSelected = localSelected.has(file.id);
        return (
          <button
            key={file.id}
            onClick={() => toggleFile(file.id)}
            className={`
              w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200
              ${isSelected
                ? "bg-green-50 border-2 border-green-400 shadow-sm"
                : "bg-white border-2 border-slate-100 hover:border-green-200 hover:bg-green-50/30"
              }
            `}
          >
            <div className={`p-2.5 rounded-lg ${isSelected ? "bg-green-100" : "bg-slate-50"}`}>
              <FileText size={20} className={isSelected ? "text-green-600" : "text-slate-400"} />
            </div>
            <span className={`flex-1 text-left text-sm font-medium truncate ${isSelected ? "text-green-900" : "text-slate-700"}`}>
              {file.name}
            </span>
            {file.sizeBytes && (
              <span className="text-xs text-slate-400 shrink-0">
                {(file.sizeBytes / 1024).toFixed(1)} KB
              </span>
            )}
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${isSelected ? "bg-green-500 border-green-500" : "border-slate-300"
              }`}>
              {isSelected && <CheckCircle2 size={14} className="text-white" strokeWidth={3} />}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-slate-400 mb-3" />
          <p className="text-sm text-slate-500">Loading files…</p>
        </div>
      );
    }

    if (files.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Icon size={40} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">No files found</p>
          <p className="text-xs text-slate-400 mt-1">Upload some files first using the sidebar panel</p>
        </div>
      );
    }

    switch (bucketType) {
      case "image":
        return renderImageGallery();
      case "video":
        return renderVideoGallery();
      case "audio":
        return renderAudioList();
      case "text":
        return renderTextList();
    }
  };

  // Accent colors per bucket type for the confirm button
  const accentColors: Record<BucketType, { bg: string; hover: string; ring: string }> = {
    image: { bg: "bg-blue-500", hover: "hover:bg-blue-600", ring: "focus:ring-blue-300" },
    video: { bg: "bg-amber-500", hover: "hover:bg-amber-600", ring: "focus:ring-amber-300" },
    audio: { bg: "bg-purple-500", hover: "hover:bg-purple-600", ring: "focus:ring-purple-300" },
    text: { bg: "bg-green-500", hover: "hover:bg-green-600", ring: "focus:ring-green-300" },
  };
  const accent = accentColors[bucketType];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-300">
        {/* ─── Header ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${theme.iconBg}`}>
              <Icon size={20} className={theme.iconColor} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{modalTitle}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {files.length} available · {localSelected.size} selected
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {files.length > 0 && (
              <>
                <button
                  onClick={selectAll}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
                >
                  Clear
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* ─── Body (scrollable) ──────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>

        {/* ─── Footer ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/80 shrink-0">
          <p className="text-sm text-slate-500">
            {localSelected.size} {localSelected.size === 1 ? "file" : "files"} selected
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className={`px-5 py-2 text-sm font-semibold text-white ${accent.bg} ${accent.hover} rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.97] focus:outline-none focus:ring-2 ${accent.ring}`}
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
