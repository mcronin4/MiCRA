export type FlagType = 'spelling' | 'grammar' | 'brand' | 'proper_noun' | 'standard_term';

export interface QualityFlag {
  id: string;
  text: string;
  type: FlagType;
  suggestion: string | null;
  reasoning: string;
  startIndex: number;
  endIndex: number;
  status: 'pending' | 'approved' | 'edited' | 'regenerating';
}

export interface QualityResponse {
  flags: QualityFlag[];
}

export interface CheckRequest {
  text: string;
}

export interface StandardizeRequest {
  term: string;
  correction: string;
}

// Flag type metadata for UI display
export const FLAG_TYPE_CONFIG: Record<FlagType, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}> = {
  proper_noun: {
    label: 'Proper Noun',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100/80',
    borderColor: 'border-blue-300',
    icon: '👤',
  },
  spelling: {
    label: 'Spelling',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100/80',
    borderColor: 'border-amber-300',
    icon: '✏️',
  },
  brand: {
    label: 'Brand Reference',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100/80',
    borderColor: 'border-purple-300',
    icon: '🏢',
  },
  grammar: {
    label: 'Grammar',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100/80',
    borderColor: 'border-orange-300',
    icon: '📝',
  },
  standard_term: {
    label: 'Standard Term',
    color: 'text-teal-700',
    bgColor: 'bg-teal-100/80',
    borderColor: 'border-teal-300',
    icon: '📖',
  },
};

// Content with quality flags attached
export interface FlaggedContent {
  nodeId: string;
  nodeType: 'LinkedIn' | 'Email' | 'TikTok';
  content: string;
  flags: QualityFlag[];
  isChecking: boolean;
  lastChecked: Date | null;
}

// Standard dictionary entry for the session
export interface StandardTermEntry {
  term: string;
  correction: string;
  addedAt: Date;
}

// Regeneration request
export interface RegenerationRequest {
  nodeId: string;
  flagId?: string;
  feedback: string;
  originalContent: string;
}
