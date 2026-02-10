import { useState } from 'react';
import { transcribeUrl, transcribeFile } from '@/lib/fastapi/transcription';
import type { TranscriptionResult } from '@/components/workflow/types';

export const useTranscription = (onTranscriptionComplete?: (fullText: string) => void) => {
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaInputType, setMediaInputType] = useState<'url' | 'file'>('url');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  const handleTranscribe = async () => {
    const hasInput = mediaInputType === 'url' ? mediaUrl.trim() : selectedFile !== null;
    if (!hasInput) return;

    setIsTranscribing(true);
    setTranscriptionError(null);
    setTranscriptionResult(null);
    
    try {
      let response;
      if (mediaInputType === 'url') {
        response = await transcribeUrl(mediaUrl.trim());
      } else {
        response = await transcribeFile(selectedFile!);
      }
      
      if (response.success && response.segments) {
        setTranscriptionResult({ segments: response.segments });
        
        // Automatically add transcription as a source
        const fullText = response.segments.map(seg => seg.text).join(' ').trim();
        if (fullText && onTranscriptionComplete) {
          onTranscriptionComplete(fullText);
        }
      } else {
        setTranscriptionError(response.error || 'Transcription failed');
      }
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : 'Failed to transcribe');
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
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
  };
};

