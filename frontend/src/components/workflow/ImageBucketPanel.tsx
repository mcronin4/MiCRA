"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  X,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useWorkflowStore, ImageBucketItem } from "@/lib/stores/workflowStore";
import Image from "next/image";

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function ImageBucketPanel() {
  const imageBucket = useWorkflowStore((state) => state.imageBucket);
  const addImagesToBucket = useWorkflowStore(
    (state) => state.addImagesToBucket,
  );
  const removeImageFromBucket = useWorkflowStore(
    (state) => state.removeImageFromBucket,
  );
  const clearImageBucket = useWorkflowStore((state) => state.clearImageBucket);

  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => f.type.startsWith("image/"));

    const newImages: Omit<ImageBucketItem, "addedAt">[] = await Promise.all(
      validFiles.map(async (file) => ({
        id: `bucket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        base64: await fileToBase64(file),
        name: file.name,
      })),
    );

    if (newImages.length > 0) {
      addImagesToBucket(newImages);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
            <ImageIcon size={14} strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold text-slate-700 tracking-tight">
            Media Assets
          </span>
          {imageBucket.length > 0 && (
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100">
              {imageBucket.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown
            size={14}
            className="text-slate-400 group-hover:text-slate-600"
          />
        ) : (
          <ChevronUp
            size={14}
            className="text-slate-400 group-hover:text-slate-600"
          />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Drop zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative w-full border border-dashed rounded-xl transition-all duration-200 cursor-pointer
              ${
                isDragging
                  ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 ring-offset-2"
                  : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
              }
              ${imageBucket.length > 0 ? "p-3" : "p-6"}
            `}
          >
            {imageBucket.length === 0 ? (
              // Empty state
              <div className="flex flex-col items-center justify-center text-center">
                <div
                  className={`p-2.5 rounded-full mb-2 transition-colors ${
                    isDragging
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-white text-slate-400 shadow-sm border border-slate-100"
                  }`}
                >
                  <Upload size={18} strokeWidth={2} />
                </div>
                <p
                  className={`text-xs font-semibold ${
                    isDragging ? "text-indigo-700" : "text-slate-700"
                  }`}
                >
                  {isDragging ? "Drop images now" : "Upload Images"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Drag & drop or click to browse
                </p>
              </div>
            ) : (
              // Has images
              <>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {imageBucket.map((image) => (
                    <div
                      key={image.id}
                      className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Image
                        src={image.base64}
                        alt={image.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImageFromBucket(image.id);
                        }}
                        className="absolute top-0.5 right-0.5 bg-white/90 hover:bg-red-500 text-slate-500 hover:text-white rounded-md p-0.5 opacity-0 group-hover:opacity-100 transition-all shadow-sm backdrop-blur-sm"
                        aria-label="Remove image"
                      >
                        <X size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>
                <div
                  className={`
                    flex items-center justify-center gap-1.5 text-[10px] pt-2 border-t border-slate-200/50 mt-2
                    ${isDragging ? "text-indigo-600 font-medium" : "text-slate-400"}
                  `}
                >
                  <Upload size={10} />
                  <span>{isDragging ? "Drop to add" : "Add more images"}</span>
                </div>
              </>
            )}
          </div>

          {/* Clear all button */}
          {imageBucket.length > 0 && (
            <button
              onClick={clearImageBucket}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all py-1.5"
            >
              <Trash2 size={12} />
              <span>Clear Bucket</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
