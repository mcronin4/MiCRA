import React from 'react';
import type { TranscriptionResult } from '../types';

interface VideoTabProps {
  mediaUrl: string;
  setMediaUrl: (url: string) => void;
  mediaInputType: 'url' | 'file';
  setMediaInputType: (type: 'url' | 'file') => void;
  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;
  isTranscribing: boolean;
  transcriptionResult: TranscriptionResult | null;
  transcriptionError: string | null;
  handleTranscribe: () => void;
}

export const VideoTab: React.FC<VideoTabProps> = ({
  mediaUrl,
  setMediaUrl,
  mediaInputType,
  setMediaInputType,
  selectedFile,
  setSelectedFile,
  isTranscribing,
  transcriptionResult,
  transcriptionError,
  handleTranscribe,
}) => {
  return (
    <div>
      <div className="mb-4 p-4">
        <div className="flex flex-col gap-3 h-full justify-center">
          {/* Input Type Toggle */}
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => {
                setMediaInputType('url');
                setSelectedFile(null);
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mediaInputType === 'url'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Enter URL
            </button>
            <button
              type="button"
              onClick={() => {
                setMediaInputType('file');
                setMediaUrl('');
              }}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mediaInputType === 'file'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Upload File
            </button>
          </div>

          {/* URL Input */}
          {mediaInputType === 'url' && (
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="Enter video/audio URL"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {/* File Upload */}
          {mediaInputType === 'file' && (
            <div className="w-full">
              <label className="flex flex-col items-center justify-center w-full h-20 px-3 py-2 text-sm border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex flex-col items-center justify-center">
                  <svg className="w-6 h-6 text-gray-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-xs text-gray-600">
                    {selectedFile ? selectedFile.name : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">MP3, MP4, WAV, MOV, MKV, etc.</p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="audio/*,video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  Remove file
                </button>
              )}
            </div>
          )}

          <button
            onClick={handleTranscribe}
            disabled={isTranscribing || (mediaInputType === 'url' ? !mediaUrl.trim() : !selectedFile)}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTranscribing ? 'Transcribing...' : 'Submit'}
          </button>
          {isTranscribing && (
            <p className="text-xs text-gray-500 text-center">Processing audio, please wait...</p>
          )}
          {transcriptionError && (
            <p className="text-xs text-red-500 text-center mt-2">{transcriptionError}</p>
          )}
        </div>
      </div>
      <h3 className="font-semibold mb-2 text-sm">Keyframes</h3>
      <div className="flex space-x-2 mb-4">
        <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
        <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
        <div className="w-24 h-16 bg-gray-800/10 rounded-md"></div>
      </div>
      <h3 className="font-semibold mb-2 text-sm">Transcript</h3>
      <div className="text-xs text-gray-600 max-h-48 overflow-y-auto">
        {transcriptionResult && transcriptionResult.segments.length > 0 ? (
          transcriptionResult.segments.map((seg, index) => {
            const minutes = Math.floor(seg.start / 60);
            const seconds = Math.floor(seg.start % 60);
            const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
            return (
              <p key={index} className="mb-1">
                {timeStr} {seg.text}
              </p>
            );
          })
        ) : (
          <p className="text-gray-400 italic">No transcription yet. Submit a URL to transcribe.</p>
        )}
      </div>
    </div>
  );
};

