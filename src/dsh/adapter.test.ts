import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AntigravityLlmAdapter } from './adapter';
import { ANTIGRAVITY_DSH_MODELS } from './models';
import type { DshGenerateOptions } from './types';

describe('AntigravityLlmAdapter', () => {
  let mockAccountManager: any;
  let adapter: AntigravityLlmAdapter;

  beforeEach(() => {
    mockAccountManager = {
      getAccountCount: vi.fn().mockReturnValue(2),
      getCurrentOrNextForFamily: vi.fn()
        .mockReturnValueOnce({
          index: 0,
          email: 'account1@gmail.com',
          access: 'token-1',
          expires: Date.now() + 3600_000,
          parts: { refreshToken: 'refresh-1', projectId: 'project-1' },
        })
        .mockReturnValue({
          index: 1,
          email: 'account2@gmail.com',
          access: 'token-2',
          expires: Date.now() + 3600_000,
          parts: { refreshToken: 'refresh-2', projectId: 'project-2' },
        }),
      markRequestSuccess: vi.fn(),
      markRateLimitedWithReason: vi.fn(),
      requestSaveToDisk: vi.fn(),
    };
    adapter = new AntigravityLlmAdapter(mockAccountManager);
  });

  it('lists registered models', async () => {
    const models = await adapter.listModels('antigravity');
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id === 'antigravity-gemini-3.8-flash-high')).toBe(true);
    expect(models.some((m) => m.id === 'antigravity-claude-opus-5-5-high')).toBe(true);
  });

  it('resolves model info properly', async () => {
    const model = await adapter.resolveModel('antigravity', 'antigravity-gemini-3.8-flash-high');
    expect(model.name).toContain('Gemini 3.8 Flash');
    expect(model.contextWindow).toBe(1048576);
  });

  it('streams text and reasoning deltas from mock SSE payload', async () => {
    const mockSse = [
      'data: {"response":{"candidates":[{"content":{"parts":[{"thought":true,"text":"Thinking step 1"}]}}]}}',
      'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Hello world"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5}}}',
      '',
    ].join('\n');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(mockSse));
          controller.close();
        },
      }),
    });

    const options: DshGenerateOptions = {
      provider: 'antigravity',
      model: 'antigravity-gemini-3.8-flash-high',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const chunks = [];
    for await (const chunk of adapter.stream(options)) {
      chunks.push(chunk);
    }

    expect(chunks.some((c) => c.type === 'reasoning-delta' && c.text === 'Thinking step 1')).toBe(true);
    expect(chunks.some((c) => c.type === 'text-delta' && c.text === 'Hello world')).toBe(true);
    expect(chunks.some((c) => c.type === 'usage')).toBe(true);
    expect(chunks.some((c) => c.type === 'finish')).toBe(true);
  });

  it('auto-rotates to second account on 429 rate limit', async () => {
    const mockSuccessSse = 'data: {"response":{"candidates":[{"content":{"parts":[{"text":"Recovered on account 2"}]}}]}}\n\n';

    globalThis.fetch = vi.fn()
      // First call (account 1) fails with 429
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit exceeded'),
      })
      // Second call (account 2) succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(mockSuccessSse));
            controller.close();
          },
        }),
      });

    const options: DshGenerateOptions = {
      provider: 'antigravity',
      model: 'antigravity-gemini-3.8-flash-high',
      messages: [{ role: 'user', content: 'Hi' }],
    };

    const chunks = [];
    for await (const chunk of adapter.stream(options)) {
      chunks.push(chunk);
    }

    expect(mockAccountManager.markRateLimitedWithReason).toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'text-delta' && c.text === 'Recovered on account 2')).toBe(true);
  });
});
