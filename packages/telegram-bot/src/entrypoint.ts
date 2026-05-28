#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { AllowlistManager } from "./allowlist.js";
import { CredentialStore } from "./credentials/store.js";
import { SessionManager as PiSessionManager } from "./session/manager.js";
import { createBot } from "./bot.js";

async function main(): Promise<void> {
  console.log("🤖 Pi Orchestrator Bot starting...");

  const config = loadConfig();
  console.log(`📋 Persona: ${config.personaName}`);
  console.log(`📂 Data dir: ${config.dataDir}`);

  // Init allowlist
  const allowlist = new AllowlistManager(config.dataDir, config.telegramAdminId);
  await allowlist.load();
  console.log(`👑 Admin: ${config.telegramAdminId}`);

  // Init credential store
  const credentials = new CredentialStore(config.dataDir, config.telegramBotToken, config.telegramAdminId);

  // Init pi session manager
  const piSessions = new PiSessionManager(config, credentials);

  // Create and start bot
  const bot = createBot({ config, allowlist, credentials, piSessions });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start long-polling
  console.log("✅ Bot started. Listening for messages...");
  await bot.start();
}

main().catch((err) => {
  console.error("💥 Fatal error:", err);
  process.exit(1);
});
