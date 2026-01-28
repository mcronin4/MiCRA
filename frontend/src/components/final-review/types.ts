export type SourceType = 'Video' | 'Audio' | 'Images' | 'Text';

export type OutputNodeType = 'LinkedIn' | 'TikTok' | 'Email';
export type WorkflowNodeType = 'ImageMatching' | 'Transcription' | 'TextGeneration' | 'TextSummarization' | 'ImageExtraction' | 'ImageGeneration';
export type BucketNodeType = 'ImageBucket' | 'AudioBucket' | 'VideoBucket' | 'TextBucket';
export type FlowNodeType = 'End';
export type NodeType = OutputNodeType | WorkflowNodeType | BucketNodeType | FlowNodeType;

export const OUTPUT_NODES: readonly OutputNodeType[] = ['LinkedIn', 'TikTok', 'Email'];
export const WORKFLOW_NODES: readonly WorkflowNodeType[] = ['ImageMatching', 'Transcription', 'TextGeneration', 'TextSummarization', 'ImageExtraction', 'ImageGeneration'];
export const BUCKET_NODES: readonly BucketNodeType[] = ['ImageBucket', 'AudioBucket', 'VideoBucket', 'TextBucket'];
export const FLOW_NODES: readonly FlowNodeType[] = ['End'];

export interface SourceText {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
}

export interface NodeContent {
  content?: string;
  subject?: string;
  to?: string;
  username?: string;
  caption?: string;
  music?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  bookmarks?: string;
  label?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  user: string;
  text: string;
  isLoading?: boolean;
  showToneOptions?: boolean;
}

export interface ConversationState {
  generating_from_canvas?: boolean;
  waiting_for_tone?: boolean;
  waiting_for_context?: boolean;
  content_type?: string;
  user_instruction?: string;
  from_canvas?: boolean;
  show_tone_options?: boolean;
  [key: string]: unknown;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
}

