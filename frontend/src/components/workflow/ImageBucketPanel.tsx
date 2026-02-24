"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  ClipboardPaste,
  X,
} from "lucide-react";
import { useWorkflowStore, ImageBucketItem } from "@/lib/stores/workflowStore";
import { useAuth } from "@/contexts/AuthContext";
import { initUpload, completeUpload, checkHash, signDownload } from "@/lib/fastapi/files";
import { uploadToPresignedUrl, calculateFileHash } from "@/lib/storage/r2";
import { isHeicFile, getHeicErrorMessage } from "@/lib/storage/heicConvert";

export function ImageBucketPanel() {
  const imageBucket = useWorkflowStore((state) => state.imageBucket);
  const addImagesToBucket = useWorkflowStore(
    (state) => state.addImagesToBucket,
  );
  const clearImageBucket = useWorkflowStore((state) => state.clearImageBucket);
  const { user } = useAuth();

  const [isDragging, setIsDragging] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteFileName, setPasteFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showAuthError = () => {
    setUploadError("Please sign in to upload media");
    setTimeout(() => setUploadError(null), 5000);
  };

  // Helper function to determine file type from MIME type
  const getFileType = (contentType: string): 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'other' => {
    if (!contentType) return 'other';
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'audio';
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType.startsWith('text/') || contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'text';
    return 'other';
  };

  // Helper function to determine bucket from file type
  const getBucket = (fileType: 'image' | 'video' | 'audio' | 'text' | 'pdf' | 'other'): 'media' | 'docs' => {
    if (fileType === 'text' || fileType === 'pdf') return 'docs';
    return 'media';
  };

  const processFiles = async (files: FileList | File[]) => {
    // Check authentication
    if (!user) {
      showAuthError();
      return;
    }

    const fileArray = Array.from(files);
    console.log("Processing files:", fileArray.map(f => ({ name: f.name, type: f.type })));

    if (fileArray.length === 0) {
      setUploadError("No files selected");
      setTimeout(() => setUploadError(null), 5000);
      return;
    }

    console.log("Processing", fileArray.length, "files");
    setIsUploading(true);
    setUploadError(null); // Clear any previous errors
    setUploadSuccess(null); // Clear any previous success messages

    const newImages: Omit<ImageBucketItem, "addedAt">[] = [];

    for (const rawFile of fileArray) {
      try {
        // HEIC validation - block upload with helpful message
        if (isHeicFile(rawFile)) {
          setUploadError(getHeicErrorMessage(rawFile.name));
          setTimeout(() => setUploadError(null), 10000); // Show longer (10s)
          continue; // Skip this file, continue with others
        }

        console.log("Processing file:", rawFile.name);

        // Step 1: Calculate hash for deduplication
        let contentHash: string;
        try {
          contentHash = await calculateFileHash(rawFile);
          console.log("Hash calculated:", contentHash.substring(0, 16) + "...");
        } catch (error) {
          console.error("Error calculating hash:", error);
          throw new Error(`Failed to calculate file hash: ${error instanceof Error ? error.message : "Unknown error"}`);
        }

        // Step 2: Check if file already exists (deduplication)
        let hashCheck;
        try {
          hashCheck = await checkHash({ contentHash });
        } catch (error) {
          console.error("Error checking hash:", error);
          throw new Error(`Failed to check if file exists: ${error instanceof Error ? error.message : "Unknown error"}`);
        }

        let fileId: string;
        let signedUrl: string;

        if (hashCheck.exists && hashCheck.file) {
          // File already exists, use existing file
          fileId = hashCheck.file.id;
          // Get signed URL for display
          try {
            const downloadResponse = await signDownload({ fileId, expiresIn: 3600 });
            signedUrl = downloadResponse.signedUrl;
          } catch (error) {
            console.error("Error signing download for existing file:", error);
            throw new Error(`Failed to get download URL: ${error instanceof Error ? error.message : "Unknown error"}`);
          }
        } else {
          // Step 3: Initialize upload
          const contentType = rawFile.type || 'application/octet-stream';
          const fileType = getFileType(contentType);
          const bucket = getBucket(fileType);

          let initResponse;
          try {
            initResponse = await initUpload({
              bucket,
              type: fileType,
              contentType,
              name: rawFile.name,
              contentHash,
              metadata: {
                uploadedAt: new Date().toISOString(),
              },
            });
          } catch (error) {
            console.error("Error initializing upload:", error);
            throw new Error(`Failed to initialize upload: ${error instanceof Error ? error.message : "Unknown error"}`);
          }

          fileId = initResponse.file.id;

          // Step 4: Upload to R2 (use the same contentType that was signed)
          try {
            await uploadToPresignedUrl(
              initResponse.upload.signedUrl,
              rawFile,
              contentType
            );
          } catch (error) {
            console.error("Error uploading to R2:", error);
            throw new Error(`Failed to upload file to storage: ${error instanceof Error ? error.message : "Unknown error"}`);
          }

          // Step 5: Complete upload
          try {
            await completeUpload({
              fileId,
              sizeBytes: rawFile.size,
            });
          } catch (error) {
            console.error("Error completing upload:", error);
            throw new Error(`Failed to complete upload: ${error instanceof Error ? error.message : "Unknown error"}`);
          }

          // Step 6: Get signed URL for display
          try {
            const downloadResponse = await signDownload({ fileId, expiresIn: 3600 });
            signedUrl = downloadResponse.signedUrl;
          } catch (error) {
            console.error("Error signing download:", error);
            throw new Error(`Failed to get download URL: ${error instanceof Error ? error.message : "Unknown error"}`);
          }
        }

        // Add to bucket
        newImages.push({
          id: fileId,
          fileId,
          signedUrl,
          name: rawFile.name,
        });
        console.log("Successfully uploaded:", rawFile.name);
      } catch (error) {
        console.error("Upload error for", rawFile.name, ":", error);
        let errorMessage = "Unknown error";
        if (error instanceof Error) {
          errorMessage = error.message;
          // Check for network errors
          if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
            errorMessage = "Network error: Check if backend is running and accessible. " + errorMessage;
          }
        }
        setUploadError(`Failed to upload ${rawFile.name}: ${errorMessage}`);
        setTimeout(() => setUploadError(null), 5000);
        // Continue processing other files even if one fails
      }
    }

    setIsUploading(false);

    if (newImages.length > 0) {
      console.log("Adding", newImages.length, "images to bucket");
      addImagesToBucket(newImages);
      // Show success message briefly
      setUploadError(null);
      const successMessage = `Successfully uploaded ${newImages.length} file${newImages.length > 1 ? 's' : ''}`;
      setUploadSuccess(successMessage);
      setTimeout(() => setUploadSuccess(null), 3000);
    } else if (fileArray.length > 0) {
      // If we had files but none succeeded, show a generic error
      console.error("No images were successfully uploaded");
      setUploadSuccess(null);
      setUploadError("Failed to upload media. Please check your connection and try again.");
      setTimeout(() => setUploadError(null), 5000);
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

    try {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        console.log("Files dropped:", e.dataTransfer.files.length);
        await processFiles(e.dataTransfer.files);
      } else {
        console.warn("No files in dataTransfer");
      }
    } catch (error) {
      console.error("Drop error:", error);
      setUploadError(`Failed to process dropped files: ${error instanceof Error ? error.message : "Unknown error"}`);
      setTimeout(() => setUploadError(null), 5000);
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

  const handlePasteTextSubmit = async () => {
    if (!pasteText.trim()) {
      setUploadError("Please enter some text");
      setTimeout(() => setUploadError(null), 3000);
      return;
    }

    // Generate filename
    const fileName = pasteFileName.trim()
      ? (pasteFileName.endsWith('.txt') ? pasteFileName : `${pasteFileName}.txt`)
      : `pasted-text-${Date.now()}.txt`;

    // Create a File object from the pasted text
    const blob = new Blob([pasteText], { type: 'text/plain' });
    const file = new File([blob], fileName, { type: 'text/plain' });

    // Close modal and reset state
    setShowPasteModal(false);
    setPasteText("");
    setPasteFileName("");

    // Use existing upload flow
    await processFiles([file]);
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
            Upload Media
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
            accept="*/*"
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
                  {isDragging ? "Drop media now" : "Upload Media"}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Drag & drop or click to browse
                </p>
              </div>
            ) : (
              // Has images - show count instead of thumbnails
              <div className="flex flex-col items-center justify-center text-center py-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 rounded-full bg-indigo-100 text-indigo-600">
                    <ImageIcon size={14} strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">
                    {imageBucket.length} file{imageBucket.length !== 1 ? 's' : ''} uploaded
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {isDragging ? "Drop to add more" : "Drag & drop or click to add more"}
                </p>
              </div>
            )}
          </div>

          {/* Paste Text Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowPasteModal(true);
            }}
            className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-medium text-slate-600 hover:text-green-600 bg-slate-100 hover:bg-green-50 border border-slate-200 hover:border-green-200 rounded-lg transition-all py-2"
          >
            <ClipboardPaste size={14} />
            <span>Paste Text</span>
          </button>

          {/* Paste Text Modal */}
          {showPasteModal && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowPasteModal(false)}
            >
              <div
                className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-green-600" />
                    <h3 className="font-semibold text-slate-800">Paste Text</h3>
                  </div>
                  <button
                    onClick={() => setShowPasteModal(false)}
                    className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                  >
                    <X size={18} className="text-slate-400" />
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      File Name (optional)
                    </label>
                    <input
                      type="text"
                      value={pasteFileName}
                      onChange={(e) => setPasteFileName(e.target.value)}
                      placeholder="my-text-file.txt"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Text Content
                    </label>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste or type your text here..."
                      rows={8}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono"
                      autoFocus
                    />
                  </div>
                  <div className="text-xs text-slate-400">
                    {pasteText.length > 0 && `${pasteText.length} characters`}
                  </div>
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
                  <button
                    onClick={() => {
                      setShowPasteModal(false);
                      setPasteText("");
                      setPasteFileName("");
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePasteTextSubmit}
                    disabled={!pasteText.trim()}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-green-500 hover:bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    Upload as Text File
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isUploading && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-600 flex items-center gap-2">
                <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></span>
                Uploading media...
              </p>
            </div>
          )}

          {/* Success message */}
          {uploadSuccess && (
            <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs text-green-600 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                {uploadSuccess}
              </p>
            </div>
          )}

          {/* Error message */}
          {uploadError && (
            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{uploadError}</p>
            </div>
          )}

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
