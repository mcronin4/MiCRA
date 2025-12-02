import { apiClient } from './client';
import { QualityResponse, QualityFlag } from '@/types/quality';

export interface CheckQualityRequest {
  text: string;
}

export interface StandardizeResponse {
  status: string;
  message: string;
}

export const checkQuality = async (text: string): Promise<QualityResponse> => {
  const response = await apiClient.request<{ flags: Array<Omit<QualityFlag, 'id'> & { id?: string }> }>('/v1/quality/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  // Ensure all flags have IDs (generate if missing)
  const flagsWithIds: QualityFlag[] = response.flags.map((flag, index) => ({
    ...flag,
    id: flag.id || `flag-${Date.now()}-${index}`,
    status: flag.status || 'pending',
    startIndex: flag.startIndex ?? -1,
    endIndex: flag.endIndex ?? -1,
  } as QualityFlag));

  return { flags: flagsWithIds };
};

export const standardizeTerm = async (term: string, correction: string): Promise<StandardizeResponse> => {
  return apiClient.request<StandardizeResponse>('/v1/quality/standardize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ term, correction }),
  });
};

// Helper function to apply a text edit to content and recalculate flag positions
export const applyTextEdit = (
  content: string,
  flags: QualityFlag[],
  flagId: string,
  newText: string
): { newContent: string; updatedFlags: QualityFlag[] } => {
  const flagToEdit = flags.find(f => f.id === flagId);
  if (!flagToEdit) {
    return { newContent: content, updatedFlags: flags };
  }

  const { startIndex, endIndex, text: oldText } = flagToEdit;
  
  // Replace the text in content
  const newContent = content.slice(0, startIndex) + newText + content.slice(endIndex);
  
  // Calculate position shift
  const shift = newText.length - oldText.length;
  
  // Update other flags' positions
  const updatedFlags = flags.map(flag => {
    if (flag.id === flagId) {
      // Mark this flag as edited
      return {
        ...flag,
        status: 'edited' as const,
        text: newText,
        endIndex: startIndex + newText.length,
      };
    }
    
    if (flag.startIndex > endIndex) {
      // Flag is after the edit, shift positions
      return {
        ...flag,
        startIndex: flag.startIndex + shift,
        endIndex: flag.endIndex + shift,
      };
    }
    
    return flag;
  });

  return { newContent, updatedFlags };
};
