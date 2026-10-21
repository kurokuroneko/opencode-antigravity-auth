import type { DshModelInfo } from './types';

export const ANTIGRAVITY_DSH_MODELS: DshModelInfo[] = [
  {
    provider: 'antigravity',
    id: 'antigravity-gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash High (Antigravity)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoningEfforts: { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' },
  },
  {
    provider: 'antigravity',
    id: 'antigravity-gemini-3.1-pro',
    name: 'Gemini 3.1 Pro (Antigravity)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoningEfforts: { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' },
  },
  {
    provider: 'antigravity',
    id: 'antigravity-gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite (Antigravity)',
    contextWindow: 1048576,
    maxOutputTokens: 65536,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
  },
  {
    provider: 'antigravity',
    id: 'antigravity-claude-sonnet-5-5-high',
    name: 'Claude Sonnet 5.5 High (Antigravity)',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoningEfforts: { off: 'Off', high: 'High', max: 'Max' },
  },
  {
    provider: 'antigravity',
    id: 'antigravity-claude-opus-5-5-high',
    name: 'Claude Opus 5.5 High (Antigravity)',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoningEfforts: { off: 'Off', high: 'High', max: 'Max' },
  },
  {
    provider: 'antigravity',
    id: 'antigravity-claude-sonnet-4-5-thinking',
    name: 'Claude Sonnet 4.5 Thinking (Antigravity)',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    inputModalities: ['text', 'image'],
    outputModalities: ['text'],
    reasoningEfforts: { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' },
  },
];

export function getDshModel(id: string): DshModelInfo | undefined {
  return ANTIGRAVITY_DSH_MODELS.find((m) => m.id === id);
}
