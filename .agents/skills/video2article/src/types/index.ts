export interface WhisperTimestamp {
  from: string;
  to: string;
}

export interface WhisperSegment {
  timestamps: WhisperTimestamp;
  text: string;
  startMs?: number;
  endMs?: number;
}

export interface KeyframeMetadata {
  filename: string;
  filepath: string;
  timestampSeconds: number;
  timestampFormatted: string;
  hash?: string;
}

export interface ArticleSection {
  title: string;
  startTime: string;
  endTime: string;
  content: string;
  suggestedImages: string[];
}

export interface ConvertOptions {
  output?: string;
  style?: string;
  whisperBin?: string;
  whisperModel?: string;
  extractImages?: boolean;
  frameInterval?: number; // 每隔多少秒抽一帧
  llmProvider?: 'gemini' | 'openai' | 'agy';
  apiKey?: string;
  language?: string;
}

export interface V2AConfig {
  whisperBin?: string;
  whisperModel?: string;
  llmProvider?: 'gemini' | 'openai' | 'agy';
  geminiApiKey?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  agyBin?: string;
}
