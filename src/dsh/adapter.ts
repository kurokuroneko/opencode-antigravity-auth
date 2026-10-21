import crypto from 'node:crypto';
import {
  ANTIGRAVITY_ENDPOINT,
  ANTIGRAVITY_SYSTEM_INSTRUCTION,
  ANTIGRAVITY_GOOG_API_CLIENT,
  getAntigravityUserAgent,
} from '../constants';
import { AccountManager, type ModelFamily } from '../plugin/accounts';
import { refreshAccessToken } from '../plugin/token';
import { ANTIGRAVITY_DSH_MODELS, getDshModel } from './models';
import type {
  DshCallConfig,
  DshGenerateOptions,
  DshLlmChunk,
  DshMessage,
  DshModelInfo,
} from './types';

export class AntigravityLlmAdapter {
  constructor(private accountManager: AccountManager) {}

  providerInfo(provider: string) {
    return { id: provider, name: 'Google Antigravity' };
  }

  listModels(_provider: string): Promise<DshModelInfo[]> {
    return Promise.resolve(ANTIGRAVITY_DSH_MODELS);
  }

  resolveModel(_provider: string, model: string, _signal?: AbortSignal): Promise<DshModelInfo> {
    const hit = getDshModel(model);
    if (!hit) {
      return Promise.resolve({
        id: model,
        name: model,
        contextWindow: 1048576,
        maxOutputTokens: 65536,
        inputModalities: ['text', 'image', 'pdf'],
        outputModalities: ['text'],
      });
    }
    return Promise.resolve(hit);
  }

  private convertMessagesToAntigravity(messages: DshMessage[]) {
    let systemText = '';
    const contents: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text =
          typeof msg.content === 'string'
            ? msg.content
            : msg.content.map((p) => p.text || '').join('');
        systemText += (systemText ? '\n\n' : '') + text;
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            parts.push({ text: part.text });
          } else if (part.type === 'tool-call') {
            parts.push({
              functionCall: {
                name: part.name || '',
                args:
                  typeof part.arguments === 'string'
                    ? JSON.parse(part.arguments)
                    : part.arguments || {},
              },
            });
          } else if (part.type === 'tool-result') {
            parts.push({
              functionResponse: {
                name: part.name || '',
                response: { result: part.result },
              },
            });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { systemText, contents };
  }

  private buildGenerationConfig(callConfig?: DshCallConfig) {
    const config: Record<string, unknown> = {};
    if (callConfig?.maxOutputTokens) {
      config.maxOutputTokens = callConfig.maxOutputTokens;
    }
    if (callConfig?.temperature !== undefined) {
      config.temperature = callConfig.temperature;
    }
    if (callConfig?.reasoning && callConfig.reasoning !== 'off') {
      config.thinkingConfig = {
        thinkingLevel: callConfig.reasoning,
      };
    }
    return config;
  }

  async *stream(options: DshGenerateOptions): AsyncGenerator<DshLlmChunk, void, unknown> {
    const family: ModelFamily = options.model.toLowerCase().includes('claude') ? 'claude' : 'gemini';
    const maxRetries = Math.max(1, this.accountManager.getAccountCount());
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const account = this.accountManager.getCurrentOrNextForFamily(family, options.model);
      if (!account) {
        throw new Error(
          `No usable Google Antigravity account found for ${family}. Please log in via OAuth.`
        );
      }

      let accessToken = account.access;
      const isExpired = !accessToken || !account.expires || Date.now() >= account.expires - 60_000;

      if (isExpired) {
        const refreshed = await refreshAccessToken(
          {
            type: 'oauth',
            refresh: account.parts.refreshToken,
            access: account.access || '',
            expires: account.expires || 0,
          },
          null as any,
          'google'
        );

        if (refreshed?.access) {
          accessToken = refreshed.access;
          account.access = refreshed.access;
          account.expires = refreshed.expires;
          this.accountManager.requestSaveToDisk();
        } else {
          this.accountManager.markRateLimitedWithReason(
            account,
            family,
            'antigravity',
            options.model,
            'SERVER_ERROR',
            60_000
          );
          continue;
        }
      }

      const { systemText, contents } = this.convertMessagesToAntigravity(options.messages);
      const generationConfig = this.buildGenerationConfig(options.callConfig);

      const resolvedProjectId = account.parts.projectId || 'rising-fact-p41fc';
      const actualModel = options.model.replace(/^antigravity-/, '');

      const requestPayload: Record<string, unknown> = {
        contents,
        generationConfig,
        systemInstruction: {
          role: 'user',
          parts: [{ text: ANTIGRAVITY_SYSTEM_INSTRUCTION + (systemText ? `\n\n${systemText}` : '') }],
        },
      };

      const wrappedBody = {
        project: resolvedProjectId,
        model: actualModel,
        request: requestPayload,
        requestType: 'agent',
        userAgent: 'antigravity',
        requestId: `agent-${crypto.randomUUID()}`,
      };

      const endpoint = `${ANTIGRAVITY_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': getAntigravityUserAgent(),
        'X-Goog-Api-Client': ANTIGRAVITY_GOOG_API_CLIENT,
      };

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(wrappedBody),
          signal: options.signal,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }

      if (response.status === 429) {
        this.accountManager.markRateLimitedWithReason(
          account,
          family,
          'antigravity',
          options.model,
          'QUOTA_EXHAUSTED',
          60_000
        );
        lastError = new Error(`Account ${account.email || account.index} hit rate limit (429)`);
        continue;
      }

      if (response.status === 401) {
        account.expires = 0;
        lastError = new Error(`Account ${account.email || account.index} unauthorized (401)`);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(`Antigravity request failed with status ${response.status}: ${errorText}`);
        continue;
      }

      this.accountManager.markRequestSuccess(account);

      if (!response.body) {
        throw new Error('Antigravity returned empty response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;

            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;

            let parsed: any;
            try {
              parsed = JSON.parse(jsonStr);
            } catch {
              continue;
            }

            const payload = parsed.response ?? parsed;

            if (payload.candidates && Array.isArray(payload.candidates)) {
              for (const candidate of payload.candidates) {
                if (candidate.content && Array.isArray(candidate.content.parts)) {
                  for (const part of candidate.content.parts) {
                    if (part.thought === true || part.type === 'thinking' || typeof part.thought === 'string') {
                      const thoughtText = part.text || part.thought || '';
                      if (thoughtText) {
                        yield {
                          type: 'reasoning-delta',
                          index: 0,
                          text: thoughtText,
                        };
                      }
                    } else if (part.text) {
                      yield {
                        type: 'text-delta',
                        index: 0,
                        text: part.text,
                      };
                    } else if (part.functionCall) {
                      yield {
                        type: 'tool-call-delta',
                        index: 0,
                        id: part.functionCall.id || `call_${crypto.randomUUID().slice(0, 8)}`,
                        name: part.functionCall.name,
                        argumentsDelta: JSON.stringify(part.functionCall.args || {}),
                      };
                    }
                  }
                }
              }
            }

            if (payload.usageMetadata) {
              usage = {
                inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
                outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
              };
              yield { type: 'usage', usage };
            }
          }
        }

        // Process any trailing line in buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr);
                const payload = parsed.response ?? parsed;
                if (payload.candidates && Array.isArray(payload.candidates)) {
                  for (const candidate of payload.candidates) {
                    if (candidate.content && Array.isArray(candidate.content.parts)) {
                      for (const part of candidate.content.parts) {
                        if (part.text) {
                          yield {
                            type: 'text-delta',
                            index: 0,
                            text: part.text,
                          };
                        }
                      }
                    }
                  }
                }
                if (payload.usageMetadata) {
                  usage = {
                    inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
                    outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
                  };
                  yield { type: 'usage', usage };
                }
              } catch {}
            }
          }
        }

        yield {
          type: 'finish',
          finishReason: 'stop',
          usage,
        };

        return;
      } finally {
        reader.releaseLock();
      }
    }

    throw lastError || new Error('All Antigravity accounts exhausted or failed.');
  }
}
