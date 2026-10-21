import { AntigravityV2Plugin } from "./src/v2.ts";
import { AntigravityCLIOAuthPlugin as legacyServer } from "./src/plugin";
import { name, inject, apply, AntigravityLlmAdapter, ANTIGRAVITY_DSH_MODELS } from "./src/dsh/index.ts";

export {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
} from "./src/plugin";

export {
  authorizeAntigravity,
  exchangeAntigravity,
} from "./src/antigravity/oauth";

export type {
  AntigravityAuthorization,
  AntigravityTokenExchangeResult,
} from "./src/antigravity/oauth";

export {
  name,
  inject,
  apply,
  AntigravityLlmAdapter,
  ANTIGRAVITY_DSH_MODELS,
};

/** Package entrypoint compatible with DeepSeek Harness (Cordis), OpenCode V2, and OpenCode V1 */
export default {
  ...AntigravityV2Plugin,
  server: legacyServer,
  name,
  inject,
  apply,
};
