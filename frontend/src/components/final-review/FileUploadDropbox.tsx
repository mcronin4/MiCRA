"use client";
import React, { useState, useRef, useCallback } from 'react';
import { initUpload, completeUpload, checkHash } from '@/lib/fastapi/files';
import { uploadToPresignedUrl, calculateFileHash } from '@/lib/storage/r2';
import { cn } from '@/lib/utils';

interface FileUploadDropboxProps {
  className?: string;
}

export const FileUploadDropbox: React.FC<FileUploadDropboxProps> = ({ className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: string; name: string; status: 'uploading' | 'success' | 'error' | 'duplicate' }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const determineFileType = (file: File): { bucket: 'media' | 'docs'; type: 'image' | 'video' | 'text' | 'pdf' | 'audio' | 'other' } => {
    if (file.type.startsWith('image/')) {
      return { bucket: 'media', type: 'image' };
    }
    if (file.type.startsWith('video/')) {
      return { bucket: 'media', type: 'video' };
    }
    if (file.type.startsWith('audio/')) {
      return { bucket: 'media', type: 'audio' };
    }
    if (file.type === 'application/pdf') {
      return { bucket: 'docs', type: 'pdf' };
    }
    if (file.type.startsWith('text/') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return { bucket: 'docs', type: 'text' };
    }
    return { bucket: 'docs', type: 'other' };
  };

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      const tempId = `${file.name}-${Date.now()}`;
      setUploadedFiles(prev => [...prev, { id: tempId, name: file.name, status: 'uploading' }]);
      setUploadProgress(prev => ({ ...prev, [tempId]: 10 }));

      try {
        // Determine bucket and type
        const { bucket, type } = determineFileType(file);

        // Step 1: Calculate hash
        setUploadProgress(prev => ({ ...prev, [tempId]: 20 }));
        const contentHash = await calculateFileHash(file);

        // Step 2: Check if file already exists (deduplication)
        setUploadProgress(prev => ({ ...prev, [tempId]: 30 }));
        const hashCheck = await checkHash({ contentHash });

        if (hashCheck.exists && hashCheck.file) {
          // File already exists, skip upload
          setUploadedFiles(prev => 
            prev.map(f => f.id === tempId ? { ...f, status: 'duplicate' as const } : f)
          );
          setUploadProgress(prev => ({ ...prev, [tempId]: 100 }));

          // Remove duplicate message after 3 seconds
          setTimeout(() => {
            setUploadedFiles(prev => prev.filter(f => f.id !== tempId));
            setUploadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[tempId];
              return newProgress;
            });
          }, 3000);
          continue;
        }

        // Step 3: Initialize upload
        setUploadProgress(prev => ({ ...prev, [tempId]: 40 }));
        const initResponse = await initUpload({
          bucket,
          type,
          contentType: file.type,
          name: file.name,
          contentHash,
          metadata: {
            uploadedAt: new Date().toISOString(),
          },
        });

        // Step 4: Upload to R2
        setUploadProgress(prev => ({ ...prev, [tempId]: 50 }));
        await uploadToPresignedUrl(
          initResponse.upload.signedUrl,
          file,
          file.type
        );

        // Step 5: Complete upload
        setUploadProgress(prev => ({ ...prev, [tempId]: 90 }));
        await completeUpload({
          fileId: initResponse.file.id,
          sizeBytes: file.size,
        });

        // Update status
        setUploadedFiles(prev => 
          prev.map(f => f.id === tempId ? { ...f, status: 'success' as const } : f)
        );
        setUploadProgress(prev => ({ ...prev, [tempId]: 100 }));

        // Remove success message after 3 seconds
        setTimeout(() => {
          setUploadedFiles(prev => prev.filter(f => f.id !== tempId));
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[tempId];
            return newProgress;
          });
        }, 3000);
      } catch (error) {
        console.error('Upload error:', error);
        setUploadedFiles(prev => 
          prev.map(f => f.id === tempId ? { ...f, status: 'error' as const } : f)
        );
        
        // Remove error message after 5 seconds
        setTimeout(() => {
          setUploadedFiles(prev => prev.filter(f => f.id !== tempId));
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[tempId];
            return newProgress;
          });
        }, 5000);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileUpload(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const hasActiveUploads = uploadedFiles.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-gray-700">File Storage</h3>
      
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-4 transition-all duration-200 cursor-pointer",
          isDragging
            ? "border-blue-500 bg-blue-50/50"
            : "border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        
        <div className="flex flex-col items-center justify-center text-center space-y-2">
          <svg
            className="w-8 h-8 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div className="text-xs text-gray-600">
            <p className="font-medium">Drop files here</p>
            <p className="text-gray-500 mt-1">or click to browse</p>
          </div>
        </div>
      </div>

      {/* Upload status list */}
      {hasActiveUploads && (
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className={cn(
                "text-xs p-2 rounded border",
                file.status === 'success' && "bg-green-50 border-green-200 text-green-800",
                file.status === 'error' && "bg-red-50 border-red-200 text-red-800",
                file.status === 'uploading' && "bg-blue-50 border-blue-200 text-blue-800",
                file.status === 'duplicate' && "bg-yellow-50 border-yellow-200 text-yellow-800"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium truncate flex-1 mr-2">{file.name}</span>
                {file.status === 'success' && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {file.status === 'error' && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {file.status === 'duplicate' && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H6a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H16a1 1 0 110 2h-2a1 1 0 01-1-1v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {file.status === 'uploading' && uploadProgress[file.id] !== undefined && (
                <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress[file.id]}%` }}
                  />
                </div>
              )}
              {file.status === 'duplicate' && (
                <div className="text-xs mt-1">File already exists (deduplicated)</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

