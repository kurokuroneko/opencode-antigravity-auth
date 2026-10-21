import { AntigravityLlmAdapter } from './adapter';
import { ANTIGRAVITY_DSH_MODELS } from './models';

export const name = 'dsh-llm-antigravity';
export const inject = ['llm'] as const;

export interface AntigravityPluginConfig {
  autoRotateOnRateLimit?: boolean;
  defaultModel?: string;
}

export function apply(ctx: any, config: AntigravityPluginConfig = {}) {
  const adapter = new AntigravityLlmAdapter();

  if (typeof ctx.llm?.registerConfigurableProviders === 'function') {
    ctx.llm.registerConfigurableProviders([
      {
        provider: 'antigravity',
        displayName: 'Google Antigravity',
        settingsNs: 'dsh-llm-antigravity',
        settingsPath: [],
      },
    ]);
  }

  if (typeof ctx.llm?.registerAdapter === 'function') {
    ctx.llm.registerAdapter(['antigravity'], adapter);
  }
}

export { AntigravityLlmAdapter } from './adapter';
export { ANTIGRAVITY_DSH_MODELS } from './models';
export * from './types';
