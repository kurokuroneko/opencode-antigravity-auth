import { AccountManager } from '../plugin/accounts';
import { authorizeAntigravity, exchangeAntigravity } from '../antigravity/oauth';
import { startOAuthListener } from '../plugin/server';
import { AntigravityLlmAdapter } from './adapter';
import { ANTIGRAVITY_DSH_MODELS } from './models';

export const name = 'dsh-llm-antigravity';
export const inject = ['llm'] as const;

export interface AntigravityPluginConfig {
  autoRotateOnRateLimit?: boolean;
  defaultModel?: string;
}

export function apply(ctx: any, config: AntigravityPluginConfig = {}) {
  let adapter: AntigravityLlmAdapter | null = null;

  ctx.on('ready', async () => {
    const accountManager = await AccountManager.loadFromDisk();
    adapter = new AntigravityLlmAdapter(accountManager);

    if (typeof ctx.llm?.registerAdapter === 'function') {
      ctx.llm.registerAdapter(['antigravity'], adapter);
    }

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
  });

  // Provide CLI login helper for DSH
  if (ctx.command) {
    ctx.command('antigravity.login', 'Authenticate with Google Antigravity OAuth')
      .action(async ({ session }: any) => {
        const listener = await startOAuthListener();
        const authorization = await authorizeAntigravity();
        const msg = `Please open the following URL in your browser to sign in:\n${authorization.url}`;
        if (session) {
          session.send(msg);
        } else {
          console.log(msg);
        }

        try {
          const callbackUrl = await listener.waitForCallback();
          const parsed = new URL(callbackUrl);
          const code = parsed.searchParams.get('code');
          const state = parsed.searchParams.get('state');

          if (!code || !state) {
            const err = 'OAuth callback missing code or state';
            if (session) session.send(err);
            return;
          }

          const result = await exchangeAntigravity(code, state);
          if (result.type === 'success') {
            const successMsg = `Successfully authenticated with ${result.email || 'Google'}!`;
            if (session) session.send(successMsg);
            else console.log(successMsg);
          } else {
            const failMsg = `Authentication failed: ${result.error}`;
            if (session) session.send(failMsg);
            else console.error(failMsg);
          }
        } finally {
          await listener.close().catch(() => {});
        }
      });
  }
}

export { AntigravityLlmAdapter } from './adapter';
export { ANTIGRAVITY_DSH_MODELS } from './models';
export * from './types';
