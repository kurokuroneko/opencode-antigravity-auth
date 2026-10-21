#!/usr/bin/env node
import { authorizeAntigravity, exchangeAntigravity } from "../dist/src/antigravity/oauth.js";
import { startOAuthListener } from "../dist/src/plugin/server.js";
import { saveAccounts, loadAccounts } from "../dist/src/plugin/storage.js";
import { parseRefreshParts } from "../dist/src/plugin/auth.js";
import { exec } from "node:child_process";

async function openBrowser(url) {
  const start = process.platform === "win32" ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  return new Promise((resolve) => {
    exec(`${start} "${url}"`, (error) => {
      resolve(!error);
    });
  });
}

async function main() {
  console.log("\n=======================================================");
  console.log("   Google Antigravity OAuth Login (DeepSeek Harness)   ");
  console.log("=======================================================\n");

  let listener;
  try {
    listener = await startOAuthListener();
  } catch (err) {
    console.error("Failed to start local OAuth listener on port 51121:", err.message);
    process.exit(1);
  }

  const authorization = await authorizeAntigravity();
  console.log("Opening browser for Google Antigravity OAuth authorization...");
  console.log("If your browser doesn't open automatically, visit this URL:\n");
  console.log(authorization.url + "\n");

  await openBrowser(authorization.url);

  console.log("Waiting for OAuth sign-in completion...");

  try {
    const callbackUrl = await listener.waitForCallback();
    const url = new URL(callbackUrl);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    if (!code || !state) {
      console.error("Authentication failed: Callback URL missing code or state parameter.");
      process.exit(1);
    }

    console.log("Authorization code received. Exchanging token with Google...");
    const result = await exchangeAntigravity(code, state);

    if (result.type === "success") {
      const parts = parseRefreshParts(result.refresh);
      const existing = (await loadAccounts()) || { version: 4, accounts: [], activeIndex: 0 };
      
      const newAccount = {
        email: result.email,
        refreshToken: parts.refreshToken,
        projectId: parts.projectId || result.projectId,
        managedProjectId: parts.managedProjectId,
        addedAt: Date.now(),
        lastUsed: Date.now(),
        rateLimitResetTimes: {},
        enabled: true,
      };

      const accountIndex = existing.accounts.findIndex(
        (a) => a.refreshToken === parts.refreshToken || (result.email && a.email === result.email)
      );

      if (accountIndex >= 0) {
        existing.accounts[accountIndex] = { ...existing.accounts[accountIndex], ...newAccount };
      } else {
        existing.accounts.push(newAccount);
      }

      await saveAccounts(existing);

      console.log("\n[SUCCESS] Authentication successful!");
      if (result.email) console.log(`Account: ${result.email}`);
      if (parts.projectId) console.log(`Project: ${parts.projectId}`);
      console.log("Saved to antigravity-accounts.json. You can now use Antigravity models in DeepSeek Harness!\n");
    } else {
      console.error("\n[FAILED] Token exchange failed:", result.error);
      process.exit(1);
    }
  } catch (err) {
    console.error("\n[ERROR] An error occurred during authentication:", err.message);
    process.exit(1);
  } finally {
    await listener.close().catch(() => {});
  }
}

main();
