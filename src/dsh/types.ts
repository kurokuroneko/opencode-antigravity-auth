export type DshRole = 'system' | 'user' | 'assistant' | 'tool';

export interface DshContentPart {
  type: 'text' | 'image' | 'tool-call' | 'tool-result';
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown> | string;
  result?: unknown;
}

export interface DshMessage {
  role: DshRole;
  content: string | DshContentPart[];
}

export interface DshCallConfig {
  reasoning?: 'off' | 'low' | 'medium' | 'high' | 'max';
  maxOutputTokens?: number;
  temperature?: number;
}

export interface DshGenerateOptions {
  provider: string;
  model: string;
  messages: DshMessage[];
  callConfig?: DshCallConfig;
  signal?: AbortSignal;
}

export type DshLlmChunk =
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'finish'; finishReason: string; usage?: { inputTokens: number; outputTokens: number } };

export interface DshModelInfo {
  provider?: string;
  id: string;
  name: string;
  description?: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputModalities?: string[];
  outputModalities?: string[];
  reasoningEfforts?: Record<string, string>;
}
