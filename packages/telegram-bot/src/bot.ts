import { Bot, InlineKeyboard, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";

import type { BotConfig } from "./config.js";
import { AllowlistManager } from "./allowlist.js";
import { CredentialStore } from "./credentials/store.js";
import { verifyProvider, verifyCloudflare } from "./credentials/verify.js";
import { WorkspaceManager } from "./session/workspace.js";
import { SessionManager as PiSessionManager } from "./session/manager.js";
import { buildPersona } from "./persona.js";
import { markdownToTelegramHTML, truncateForTelegram } from "./format.js";

export interface BotDependencies {
  config: BotConfig;
  allowlist: AllowlistManager;
  credentials: CredentialStore;
  piSessions: PiSessionManager;
}

export function createBot(deps: BotDependencies): Bot {
  const { config, allowlist, credentials } = deps;
  const bot = new Bot(config.telegramBotToken);
  const persona = buildPersona(config);

  // Auto-retry on rate limits
  bot.api.config.use(autoRetry());

  // Register slash commands with Telegram
  bot.api.setMyCommands([
    { command: "start", description: "Welcome & status" },
    { command: "menu", description: "Interactive menu" },
    { command: "new", description: "Start new site (orchestrator interview)" },
    { command: "confirm", description: "Confirm & start building" },
    { command: "deploy", description: "Deploy to Cloudflare" },
    { command: "status", description: "Current status" },
    { command: "reset", description: "Wipe orchestrator state & start fresh" },
    { command: "stop", description: "Abort running session" },
    { command: "workspace", description: "Manage workspaces" },
    { command: "model", description: "Switch AI model" },
  ]).catch(() => {});

  // --- Middleware: auth check ---
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !allowlist.isAllowed(userId)) {
      await ctx.reply("⛔ Not authorized. Contact admin for access.");
      return;
    }
    await next();
  });

  // --- /start ---
  bot.command("start", async (ctx) => {
    const userId = ctx.from!.id;
    const isAdmin = allowlist.isAdmin(userId);
    const ws = new WorkspaceManager(config.dataDir, userId);
    await ws.init();
    const active = await ws.getActiveWorkspace();

    const lines = [
      `👋 Welcome! I'm <b>${persona.name}</b>.`,
      "",
      `🆔 Your ID: <code>${userId}</code>`,
      `📂 Workspace: ${active ? `<b>${active.name}</b>` : "<i>none — use /workspace new &lt;name&gt;</i>"}`,
      isAdmin ? "👑 Role: Admin" : "👤 Role: User",
      "",
      "Use /menu for all actions or just tell me what you want to build.",
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // --- /menu ---
  bot.command("menu", async (ctx) => {
    const userId = ctx.from!.id;
    const isAdmin = allowlist.isAdmin(userId);

    const keyboard = new InlineKeyboard()
      .text("🚀 New Site", "menu:new").text("📂 Workspace", "menu:workspace").row()
      .text("📊 Status", "menu:status").text("🔄 Model", "menu:model").row()
      .text("🌐 Deploy", "menu:deploy").text("💬 Sessions", "menu:sessions").row();

    if (isAdmin) {
      keyboard.text("⚙️ Setup", "menu:setup").text("👥 Users", "menu:users").row();
    }

    await ctx.reply("What would you like to do?", { reply_markup: keyboard });
  });

  // --- /allow (admin only) ---
  bot.command("allow", async (ctx) => {
    const userId = ctx.from!.id;
    if (!allowlist.isAdmin(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply("Usage: /allow <telegram_user_id>");
      return;
    }

    const targetId = parseInt(args, 10);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      await ctx.reply("❌ Invalid user ID.");
      return;
    }

    const added = await allowlist.addUser(targetId);
    if (added) {
      await ctx.reply(`✅ User <code>${targetId}</code> added to allowlist.`, { parse_mode: "HTML" });
    } else {
      await ctx.reply(`ℹ️ User <code>${targetId}</code> already in allowlist.`, { parse_mode: "HTML" });
    }
  });

  // --- /deny (admin only) ---
  bot.command("deny", async (ctx) => {
    const userId = ctx.from!.id;
    if (!allowlist.isAdmin(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply("Usage: /deny <telegram_user_id>");
      return;
    }

    const targetId = parseInt(args, 10);
    const removed = await allowlist.removeUser(targetId);
    if (removed) {
      await ctx.reply(`✅ User <code>${targetId}</code> removed.`, { parse_mode: "HTML" });
    } else {
      await ctx.reply(`ℹ️ User <code>${targetId}</code> not in allowlist.`, { parse_mode: "HTML" });
    }
  });

  // --- /workspace ---
  bot.command("workspace", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const args = ctx.match?.trim() ?? "";

    if (args.startsWith("new ")) {
      const name = args.slice(4).trim().replace(/[^a-zA-Z0-9_-]/g, "-");
      if (!name) {
        await ctx.reply("Usage: /workspace new <name>");
        return;
      }
      try {
        const info = await ws.createWorkspace(name);
        await ctx.reply(`✅ Workspace <b>${info.name}</b> created and activated.`, { parse_mode: "HTML" });
      } catch (e) {
        await ctx.reply(`❌ ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }

    const workspaces = await ws.listWorkspaces();
    const active = await ws.getActiveWorkspace();

    if (workspaces.length === 0) {
      await ctx.reply("No workspaces yet. Create one:\n/workspace new <name>");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const w of workspaces) {
      const label = w.name === active?.name ? `✓ ${w.name}` : w.name;
      keyboard.text(label, `ws:switch:${w.name}`).row();
    }

    await ctx.reply("📂 Your workspaces:", { reply_markup: keyboard });
  });

  // --- /setup (admin only) ---
  bot.command("setup", async (ctx) => {
    const userId = ctx.from!.id;
    if (!allowlist.isAdmin(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const args = ctx.match?.trim() ?? "";
    const parts = args.split(/\s+/);

    if (parts[0] === "provider" && parts.length >= 3) {
      const providerName = parts[1]!;
      const apiKey = parts.slice(2).join(" ");

      await ctx.reply(`🔄 Verifying ${providerName} credentials...`);
      const result = await verifyProvider(providerName, apiKey);

      if (!result.ok) {
        await ctx.reply(`❌ Verification failed: ${result.error}\nCredentials NOT saved.`);
        return;
      }

      await credentials.addProvider(providerName, apiKey);

      // Auto-enable discovered models
      if (result.models && result.models.length > 0) {
        const modelConfig = await credentials.getModelConfig();
        for (const m of result.models) {
          if (!modelConfig.enabled.includes(m)) modelConfig.enabled.push(m);
        }
        if (!modelConfig.default && modelConfig.enabled.length > 0) {
          modelConfig.default = modelConfig.enabled[0]!;
        }
        await credentials.saveModelConfig(modelConfig);
      }

      const modelList = result.models?.slice(0, 5).join(", ") ?? "none discovered";
      await ctx.reply(
        `✅ <b>${providerName}</b> verified and enabled!\nModels: <code>${modelList}</code>`,
        { parse_mode: "HTML" }
      );
      // Delete the message with the API key for security
      try { await ctx.deleteMessage(); } catch { /* may fail if old */ }
      return;
    }

    if (parts[0] === "cloudflare" && parts.length >= 3) {
      const token = parts[1]!;
      const accountId = parts[2]!;

      await ctx.reply("🔄 Verifying cloudflare access...");
      const result = await verifyCloudflare(token, accountId);

      if (!result.ok) {
        await ctx.reply(`❌ Verification failed: ${result.error}\nCredentials NOT saved.`);
        return;
      }

      await credentials.saveDeployCredentials({
        apiToken: token,
        accountId,
        verified: true,
        addedAt: new Date().toISOString(),
      });

      await ctx.reply(`✅ Cloudflare verified! ${result.accountName ?? ""}`);
      try { await ctx.deleteMessage(); } catch { /* may fail */ }
      return;
    }

    if (parts[0] === "remove" && parts[1]) {
      const removed = await credentials.removeProvider(parts[1]);
      await ctx.reply(removed ? `✅ ${parts[1]} removed.` : `ℹ️ ${parts[1]} not found.`);
      return;
    }

    await ctx.reply(
      [
        "⚙️ <b>Setup commands:</b>",
        "",
        "<code>/setup provider &lt;name&gt; &lt;api_key&gt;</code>",
        "<code>/setup cloudflare &lt;token&gt; &lt;account_id&gt;</code>",
        "<code>/setup remove &lt;provider&gt;</code>",
        "",
        "Providers: anthropic, openai, google, groq",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  // --- /model ---
  bot.command("model", async (ctx) => {
    const modelConfig = await credentials.getModelConfig();

    if (modelConfig.enabled.length === 0) {
      await ctx.reply("No models configured. Admin needs to /setup provider first.");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (const m of modelConfig.enabled) {
      const label = m === modelConfig.default ? `✓ ${m}` : m;
      keyboard.text(label, `model:select:${m}`).row();
    }

    await ctx.reply("🔄 Select model:", { reply_markup: keyboard });
  });

  // --- /models (admin only) ---
  bot.command("models", async (ctx) => {
    const userId = ctx.from!.id;
    if (!allowlist.isAdmin(userId)) {
      await ctx.reply("⛔ Admin only.");
      return;
    }

    const args = ctx.match?.trim() ?? "";
    const parts = args.split(/\s+/);

    if (parts[0] === "enable" && parts[1]) {
      await credentials.enableModel(parts[1]);
      await ctx.reply(`✅ Model <code>${parts[1]}</code> enabled.`, { parse_mode: "HTML" });
      return;
    }

    if (parts[0] === "disable" && parts[1]) {
      await credentials.disableModel(parts[1]);
      await ctx.reply(`✅ Model <code>${parts[1]}</code> disabled.`, { parse_mode: "HTML" });
      return;
    }

    if (parts[0] === "default" && parts[1]) {
      await credentials.setDefaultModel(parts[1]);
      await ctx.reply(`✅ Default model set to <code>${parts[1]}</code>.`, { parse_mode: "HTML" });
      return;
    }

    const modelConfig = await credentials.getModelConfig();
    const lines = [
      "📋 <b>Model configuration:</b>",
      "",
      `Default: <code>${modelConfig.default || "none"}</code>`,
      "",
      "Enabled:",
      ...modelConfig.enabled.map((m) => `  ✅ <code>${m}</code>`),
      "",
      modelConfig.disabled.length > 0 ? "Disabled:" : "",
      ...modelConfig.disabled.map((m) => `  ❌ <code>${m}</code>`),
      "",
      "Commands:",
      "<code>/models enable &lt;model&gt;</code>",
      "<code>/models disable &lt;model&gt;</code>",
      "<code>/models default &lt;model&gt;</code>",
    ];

    await ctx.reply(lines.filter(Boolean).join("\n"), { parse_mode: "HTML" });
  });

  // --- /status ---
  bot.command("status", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const active = await ws.getActiveWorkspace();
    const modelConfig = await credentials.getModelConfig();

    // Check orchestrator state
    let orchestratorInfo = "<i>not started</i>";
    if (active) {
      try {
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const stateFile = join(active.path, ".orchestrator", "state.json");
        const raw = await readFile(stateFile, "utf8");
        const state = JSON.parse(raw);
        const phase = state.phase || "unknown";
        const siteName = state.answers?.siteName || state.answers?.brandName || "";
        const tasksDone = state.tasks?.filter((t: any) => t.status === "done").length ?? 0;
        const tasksTotal = state.tasks?.length ?? 0;
        orchestratorInfo = `<b>${phase}</b>`;
        if (siteName) orchestratorInfo += ` — ${siteName}`;
        if (tasksTotal > 0) orchestratorInfo += ` (${tasksDone}/${tasksTotal} tasks)`;
      } catch { /* no state file */ }
    }

    const hasSession = deps.piSessions.has(userId);

    const lines = [
      `📊 <b>Status</b>`,
      "",
      `📂 Workspace: ${active ? `<b>${active.name}</b>` : "<i>none</i>"}`,
      `🤖 Model: <code>${modelConfig.default || "not set"}</code>`,
      `🎭 Persona: ${persona.name}`,
      `🛠 Orchestrator: ${orchestratorInfo}`,
      `💬 Session: ${hasSession ? "✅ active" : "❌ none"}`,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // --- /reset (wipe orchestrator state + destroy session) ---
  bot.command("reset", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const active = await ws.getActiveWorkspace();

    if (!active) {
      await ctx.reply("❌ No active workspace.");
      return;
    }

    const { rm } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const orchestratorDir = join(active.path, ".orchestrator");

    try {
      await rm(orchestratorDir, { recursive: true, force: true });
    } catch { /* dir may not exist */ }

    deps.piSessions.destroy(userId);
    await ctx.reply(`🗑 Reset <b>${active.name}</b> — orchestrator state wiped, session destroyed.\nUse /new to start fresh.`, { parse_mode: "HTML" });
  });

  // --- /stop (abort running pi session) ---
  bot.command("stop", async (ctx) => {
    const userId = ctx.from!.id;
    const has = deps.piSessions.has(userId);
    if (!has) {
      await ctx.reply("❌ No active session.");
      return;
    }
    deps.piSessions.destroy(userId);
    await ctx.reply("⏹ Session stopped.");
  });

  // --- /deploy ---
  bot.command("deploy", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const active = await ws.getActiveWorkspace();

    if (!active) {
      await ctx.reply("❌ No active workspace. Use /workspace to select one.");
      return;
    }

    const deployCreds = await credentials.getDeployCredentials();
    if (!deployCreds) {
      await ctx.reply("❌ Cloudflare not configured. Admin needs to run:\n<code>/setup cloudflare &lt;token&gt; &lt;account_id&gt;</code>", { parse_mode: "HTML" });
      return;
    }

    const { piSessions } = deps;
    await piSessions.getOrCreate(userId);

    await ctx.replyWithChatAction("typing");

    const deployPrompt = [
      `Deploy the current project in this workspace to Cloudflare Workers.`,
      `Cloudflare credentials are available as environment variables:`,
      `  CLOUDFLARE_API_TOKEN=${deployCreds.apiToken}`,
      `  CLOUDFLARE_ACCOUNT_ID=${deployCreds.accountId}`,
      ``,
      `Steps:`,
      `1. Check if there's a built project (look for dist/, index.html, or wrangler.toml).`,
      `2. If no wrangler.toml exists, create one with:`,
      `   name = "${active.name}"`,
      `   main = "dist/_worker.js" (for Astro) or "index.html" (for static)`,
      `   compatibility_date = "2024-01-01"`,
      `   [assets]`,
      `   directory = "dist" (or "." for static HTML)`,
      `3. Run: CLOUDFLARE_API_TOKEN=${deployCreds.apiToken} CLOUDFLARE_ACCOUNT_ID=${deployCreds.accountId} npx wrangler deploy`,
      `4. Report the deployed URL back.`,
      ``,
      `If the project hasn't been built yet, build it first (pnpm build for Astro, or skip for static HTML).`,
    ].join("\n");

    let responseBuffer = "";
    let messageId: number | undefined;
    let progressMessageId: number | undefined;
    const progressMessages: number[] = [];
    let flushed = false;

    const flushResponse = async () => {
      if (!responseBuffer.trim()) return;
      const { markdownToTelegramHTML, truncateForTelegram } = await import("./format.js");
      const html = truncateForTelegram(markdownToTelegramHTML(responseBuffer));
      try {
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat!.id, messageId, html, { parse_mode: "HTML" });
        } else {
          const sent = await ctx.reply(html, { parse_mode: "HTML" });
          messageId = sent.message_id;
        }
      } catch {
        try {
          const plain = truncateForTelegram(responseBuffer);
          if (messageId) await ctx.api.editMessageText(ctx.chat!.id, messageId, plain);
          else { const sent = await ctx.reply(plain); messageId = sent.message_id; }
        } catch { /* ignore */ }
      }
    };

    const typingInterval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000);

    const unsubscribe = piSessions.subscribe(userId, {
      onTextDelta: (delta) => { responseBuffer += delta; },
      onToolStart: async (toolName) => {
        try {
          if (progressMessageId) {
            await ctx.api.editMessageText(ctx.chat!.id, progressMessageId, `⏳ ${toolName}...`);
          } else {
            const sent = await ctx.reply(`⏳ ${toolName}...`);
            progressMessageId = sent.message_id;
            progressMessages.push(sent.message_id);
          }
        } catch { /* ignore */ }
      },
      onToolEnd: () => {},
      onAgentEnd: async () => {
        clearInterval(typingInterval);
        for (const id of progressMessages) {
          try { await ctx.api.deleteMessage(ctx.chat!.id, id); } catch { /* ignore */ }
        }
        if (!flushed) { flushed = true; await flushResponse(); }
      },
    });

    try {
      await piSessions.prompt(userId, deployPrompt);
      clearInterval(typingInterval);
      for (const id of progressMessages) {
        try { await ctx.api.deleteMessage(ctx.chat!.id, id); } catch { /* ignore */ }
      }
      if (!flushed) { flushed = true; await flushResponse(); }
      if (!responseBuffer.trim()) await ctx.reply("✅ Deploy complete.");
    } catch (e) {
      clearInterval(typingInterval);
      await ctx.reply(`❌ Deploy error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      unsubscribe();
    }
  });

  // --- /confirm (trigger orchestrator pipeline after interview) ---
  bot.command("confirm", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const active = await ws.getActiveWorkspace();
    if (!active) {
      await ctx.reply("❌ No active workspace.");
      return;
    }

    const { piSessions } = deps;
    await piSessions.getOrCreate(userId);

    await ctx.replyWithChatAction("typing");

    // Tell the pi session to read the state and proceed with scaffolding+build+deploy
    const confirmPrompt = [
      `The orchestrator interview is complete and state.json is at phase "confirming".`,
      `Read .orchestrator/state.json, update confirmed=true and phase="scaffolding".`,
      `Then read .orchestrator/specs/design-system.json and .orchestrator/specs/page-spec.json.`,
      `Based on the answers in state.json (framework, backend, sections), start building the site:`,
      `1. If framework is "Static HTML": create index.html with Tailwind CDN, use the design-system colors/fonts.`,
      `2. If framework is "Astro": scaffold Astro project with the design system.`,
      `3. Build all sections from page-spec.json with the design system.`,
      `4. Make sure the content is in the language specified in answers.language.`,
      `Start building now. Do NOT ask more questions.`,
    ].join("\n");

    let responseBuffer = "";
    let messageId: number | undefined;
    let progressMessageId: number | undefined;
    const progressMessages: number[] = [];
    let flushed = false;

    const flushResponse = async () => {
      if (!responseBuffer.trim()) return;
      const { markdownToTelegramHTML, truncateForTelegram } = await import("./format.js");
      const html = truncateForTelegram(markdownToTelegramHTML(responseBuffer));
      try {
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat!.id, messageId, html, { parse_mode: "HTML" });
        } else {
          const sent = await ctx.reply(html, { parse_mode: "HTML" });
          messageId = sent.message_id;
        }
      } catch {
        try {
          const plain = truncateForTelegram(responseBuffer);
          if (messageId) await ctx.api.editMessageText(ctx.chat!.id, messageId, plain);
          else { const sent = await ctx.reply(plain); messageId = sent.message_id; }
        } catch { /* ignore */ }
      }
    };

    const typingInterval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000);

    const unsubscribe = piSessions.subscribe(userId, {
      onTextDelta: (delta) => { responseBuffer += delta; },
      onToolStart: async (toolName) => {
        try {
          if (progressMessageId) {
            await ctx.api.editMessageText(ctx.chat!.id, progressMessageId, `⏳ ${toolName}...`);
          } else {
            const sent = await ctx.reply(`⏳ ${toolName}...`);
            progressMessageId = sent.message_id;
            progressMessages.push(sent.message_id);
          }
        } catch { /* ignore */ }
      },
      onToolEnd: () => {},
      onAgentEnd: async () => {
        clearInterval(typingInterval);
        for (const id of progressMessages) {
          try { await ctx.api.deleteMessage(ctx.chat!.id, id); } catch { /* ignore */ }
        }
        if (!flushed) { flushed = true; await flushResponse(); }
      },
    });

    try {
      await piSessions.prompt(userId, confirmPrompt);
      clearInterval(typingInterval);
      for (const id of progressMessages) {
        try { await ctx.api.deleteMessage(ctx.chat!.id, id); } catch { /* ignore */ }
      }
      if (!flushed) { flushed = true; await flushResponse(); }
      if (!responseBuffer.trim()) await ctx.reply("✅ Build started.");
    } catch (e) {
      clearInterval(typingInterval);
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      unsubscribe();
    }
  });

  // --- /new (start orchestrator interview) ---
  bot.command("new", async (ctx) => {
    const userId = ctx.from!.id;
    const ws = new WorkspaceManager(config.dataDir, userId);
    const active = await ws.getActiveWorkspace();
    if (!active) {
      await ctx.reply("📂 Create a workspace first:\n/workspace new <name>");
      return;
    }

    const { piSessions } = deps;
    // Keep session if exists, only create if needed
    await piSessions.getOrCreate(userId);

    await ctx.reply(`🚀 Starting new site in <b>${active.name}</b>...`, { parse_mode: "HTML" });

    // Trigger the orchestrator interview
    const startPrompt = "Start the orchestrator interview for a new website. Ask me questions one at a time. Start with the content language question.";

    let responseBuffer = "";
    let messageId: number | undefined;
    let flushed = false;

    const flushResponse = async () => {
      if (!responseBuffer.trim()) return;
      const { markdownToTelegramHTML, truncateForTelegram } = await import("./format.js");
      const html = truncateForTelegram(markdownToTelegramHTML(responseBuffer));
      try {
        if (messageId) await ctx.api.editMessageText(ctx.chat!.id, messageId, html, { parse_mode: "HTML" });
        else { const sent = await ctx.reply(html, { parse_mode: "HTML" }); messageId = sent.message_id; }
      } catch {
        try {
          const plain = truncateForTelegram(responseBuffer);
          if (messageId) await ctx.api.editMessageText(ctx.chat!.id, messageId, plain);
          else { const sent = await ctx.reply(plain); messageId = sent.message_id; }
        } catch { /* ignore */ }
      }
    };

    const typingInterval = setInterval(() => ctx.replyWithChatAction("typing").catch(() => {}), 4000);
    await ctx.replyWithChatAction("typing");

    const unsubscribe = piSessions.subscribe(userId, {
      onTextDelta: (delta) => { responseBuffer += delta; },
      onToolStart: () => {},
      onToolEnd: () => {},
      onAgentEnd: async () => {
        clearInterval(typingInterval);
        if (!flushed) { flushed = true; await flushResponse(); }
      },
    });

    try {
      await piSessions.prompt(userId, startPrompt);
      clearInterval(typingInterval);
      if (!flushed) { flushed = true; await flushResponse(); }
    } catch (e) {
      clearInterval(typingInterval);
      await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      unsubscribe();
    }
  });

  // --- Callback queries ---
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from!.id;

    // Workspace switch
    if (data.startsWith("ws:switch:")) {
      const name = data.slice("ws:switch:".length);
      const ws = new WorkspaceManager(config.dataDir, userId);
      const switched = await ws.switchWorkspace(name);
      if (switched) {
        await ctx.answerCallbackQuery({ text: `Switched to ${name}` });
        await ctx.editMessageText(`📂 Active workspace: <b>${name}</b>`, { parse_mode: "HTML" });
      } else {
        await ctx.answerCallbackQuery({ text: "Workspace not found" });
      }
      return;
    }

    // Model select
    if (data.startsWith("model:select:")) {
      const model = data.slice("model:select:".length);
      await credentials.setDefaultModel(model);
      await ctx.answerCallbackQuery({ text: `Model: ${model}` });
      await ctx.editMessageText(`🔄 Model set to <code>${model}</code>`, { parse_mode: "HTML" });
      return;
    }

    // Menu actions
    if (data.startsWith("menu:")) {
      const action = data.slice("menu:".length);
      await ctx.answerCallbackQuery();
      const userId = ctx.from!.id;
      switch (action) {
        case "new": {
          const ws = new WorkspaceManager(config.dataDir, userId);
          const active = await ws.getActiveWorkspace();
          if (!active) {
            await ctx.editMessageText("📂 No workspace. Create one first:", {
              reply_markup: new InlineKeyboard().text("➕ New Workspace", "menu:new_ws"),
            });
          } else {
            await ctx.editMessageText(`🚀 Active: <b>${active.name}</b>\n\nTell me what you want to build!`, { parse_mode: "HTML" });
          }
          break;
        }
        case "new_ws": {
          await ctx.editMessageText("📂 Send workspace name (e.g. <code>my-site</code>):", { parse_mode: "HTML" });
          break;
        }
        case "workspace": {
          const ws = new WorkspaceManager(config.dataDir, userId);
          const workspaces = await ws.listWorkspaces();
          const active = await ws.getActiveWorkspace();
          if (workspaces.length === 0) {
            await ctx.editMessageText("📂 No workspaces yet.", {
              reply_markup: new InlineKeyboard().text("➕ Create New", "menu:new_ws"),
            });
          } else {
            const kb = new InlineKeyboard();
            for (const w of workspaces) {
              const label = w.name === active?.name ? `✓ ${w.name}` : w.name;
              kb.text(label, `ws:switch:${w.name}`).row();
            }
            kb.text("➕ Create New", "menu:new_ws").row();
            await ctx.editMessageText("📂 Your workspaces:", { reply_markup: kb });
          }
          break;
        }
        case "status": {
          const ws = new WorkspaceManager(config.dataDir, userId);
          const active = await ws.getActiveWorkspace();
          const modelConfig = await credentials.getModelConfig();
          await ctx.editMessageText(
            [
              `📊 <b>Status</b>`,
              ``,
              `📂 Workspace: ${active ? `<b>${active.name}</b>` : "<i>none</i>"}`,
              `🤖 Model: <code>${modelConfig.default || "not set"}</code>`,
              `🎭 Persona: ${persona.name}`,
            ].join("\n"),
            { parse_mode: "HTML" }
          );
          break;
        }
        case "model": {
          const modelConfig = await credentials.getModelConfig();
          if (modelConfig.enabled.length === 0) {
            await ctx.editMessageText("⚠️ No models configured. Admin: /setup provider first.");
          } else {
            const kb = new InlineKeyboard();
            for (const m of modelConfig.enabled) {
              const label = m === modelConfig.default ? `✓ ${m}` : m;
              kb.text(label, `model:select:${m}`).row();
            }
            await ctx.editMessageText("🔄 Select model:", { reply_markup: kb });
          }
          break;
        }
        case "deploy": {
          const ws = new WorkspaceManager(config.dataDir, userId);
          const active = await ws.getActiveWorkspace();
          if (!active) {
            await ctx.editMessageText("❌ No active workspace.");
          } else {
            const deployCreds = await credentials.getDeployCredentials();
            if (!deployCreds) {
              await ctx.editMessageText("❌ Cloudflare not configured. Admin: /setup cloudflare");
            } else {
              await ctx.editMessageText(`🚀 Deploying <b>${active.name}</b>...`, { parse_mode: "HTML" });
              // TODO: trigger deploy via pi session
            }
          }
          break;
        }
        case "sessions": {
          await ctx.editMessageText("💬 Session management coming soon.");
          break;
        }
        case "setup": {
          await ctx.editMessageText(
            [
              "⚙️ <b>Setup:</b>",
              "",
              "<code>/setup provider &lt;name&gt; &lt;key&gt;</code>",
              "<code>/setup cloudflare &lt;token&gt; &lt;id&gt;</code>",
              "<code>/setup remove &lt;provider&gt;</code>",
            ].join("\n"),
            { parse_mode: "HTML" }
          );
          break;
        }
        case "users": {
          const users = allowlist.getUsers();
          await ctx.editMessageText(
            users.length > 0
              ? `👥 Allowed users:\n${users.map((u) => `• <code>${u}</code>`).join("\n")}`
              : "No users added yet.",
            { parse_mode: "HTML" }
          );
          break;
        }
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // --- Natural language (fallback) ---
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;
    const userName = ctx.from!.first_name ?? "User";

    // Ensure workspace exists
    const ws = new WorkspaceManager(config.dataDir, userId);
    await ws.init();
    const active = await ws.getActiveWorkspace();
    if (!active) {
      await ctx.reply("📂 No workspace yet. Create one first:\n/workspace new <name>");
      return;
    }

    const { piSessions } = deps;

    // Ensure session exists before subscribing
    await piSessions.getOrCreate(userId);

    // Stream response from pi session
    let responseBuffer = "";
    let messageId: number | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const DEBOUNCE_MS = 1500;

    // Typing indicator
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
    await ctx.replyWithChatAction("typing");

    const flushResponse = async () => {
      if (!responseBuffer.trim()) return;
      const html = truncateForTelegram(markdownToTelegramHTML(responseBuffer));
      try {
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat!.id, messageId, html, { parse_mode: "HTML" });
        } else {
          const sent = await ctx.reply(html, { parse_mode: "HTML" });
          messageId = sent.message_id;
        }
      } catch {
        // Fallback: send without formatting if HTML parse fails
        try {
          const plain = truncateForTelegram(responseBuffer);
          if (messageId) {
            await ctx.api.editMessageText(ctx.chat!.id, messageId, plain);
          } else {
            const sent = await ctx.reply(plain);
            messageId = sent.message_id;
          }
        } catch { /* ignore */ }
      }
    };

    // Subscribe to streaming events
    let flushed = false;
    let progressMessageId: number | undefined;
    const progressMessages: number[] = [];

    const showProgress = async (text: string) => {
      try {
        if (progressMessageId) {
          await ctx.api.editMessageText(ctx.chat!.id, progressMessageId, `⏳ ${text}`);
        } else {
          const sent = await ctx.reply(`⏳ ${text}`);
          progressMessageId = sent.message_id;
          progressMessages.push(sent.message_id);
        }
      } catch { /* ignore */ }
    };

    const deleteProgressMessages = async () => {
      for (const msgId of progressMessages) {
        try { await ctx.api.deleteMessage(ctx.chat!.id, msgId); } catch { /* ignore */ }
      }
    };

    const unsubscribe = piSessions.subscribe(userId, {
      onTextDelta: (delta) => {
        responseBuffer += delta;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushResponse, DEBOUNCE_MS);
      },
      onToolStart: (toolName) => {
        ctx.replyWithChatAction("typing").catch(() => {});
        showProgress(`Running: ${toolName}...`);
      },
      onToolEnd: () => {},
      onAgentEnd: async () => {
        clearInterval(typingInterval);
        if (debounceTimer) clearTimeout(debounceTimer);
        await deleteProgressMessages();
        if (!flushed) { flushed = true; await flushResponse(); }
      },
    });

    try {
      // Include user name context in first message
      const contextualPrompt = `[User: ${userName}] ${text}`;
      await piSessions.prompt(userId, contextualPrompt);
      // Final flush only if onAgentEnd didn't already
      clearInterval(typingInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (!flushed) { flushed = true; await flushResponse(); }
      if (!responseBuffer.trim()) {
        await ctx.reply("✅ Done.");
      }
    } catch (e) {
      clearInterval(typingInterval);
      const errMsg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`❌ Error: ${errMsg}`);
    } finally {
      unsubscribe();
    }
  });

  // --- Photo/Image messages ---
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from!.id;
    const userName = ctx.from!.first_name ?? "User";
    const caption = ctx.message.caption ?? "Please analyze this image.";

    const ws = new WorkspaceManager(config.dataDir, userId);
    await ws.init();
    const active = await ws.getActiveWorkspace();
    if (!active) {
      await ctx.reply("📂 No workspace yet. Create one first:\n/workspace new <name>");
      return;
    }

    const { piSessions } = deps;
    await piSessions.getOrCreate(userId);

    // Get highest resolution photo
    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1]!;
    const file = await ctx.api.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;

    // Download image
    const response = await fetch(fileUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = file.file_path?.endsWith(".png") ? "image/png" : "image/jpeg";

    // Typing indicator
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
    await ctx.replyWithChatAction("typing");

    let responseBuffer = "";
    let messageId: number | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const DEBOUNCE_MS = 1500;

    const flushResponse = async () => {
      if (!responseBuffer.trim()) return;
      const content = responseBuffer.slice(0, 4000);
      try {
        if (messageId) {
          await ctx.api.editMessageText(ctx.chat!.id, messageId, content);
        } else {
          const sent = await ctx.reply(content);
          messageId = sent.message_id;
        }
      } catch { /* ignore */ }
    };

    const unsubscribe = piSessions.subscribe(userId, {
      onTextDelta: (delta) => {
        responseBuffer += delta;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flushResponse, DEBOUNCE_MS);
      },
      onToolStart: () => {},
      onToolEnd: () => {},
      onAgentEnd: () => {
        clearInterval(typingInterval);
        if (debounceTimer) clearTimeout(debounceTimer);
        flushResponse();
      },
    });

    try {
      const contextualPrompt = `[User: ${userName}] ${caption}`;
      await piSessions.prompt(userId, contextualPrompt, [{
        type: "image",
        source: { type: "base64", media_type: mimeType, data: base64 },
      }]);
      clearInterval(typingInterval);
      if (debounceTimer) clearTimeout(debounceTimer);
      await flushResponse();
      if (!responseBuffer.trim()) {
        await ctx.reply("✅ Done.");
      }
    } catch (e) {
      clearInterval(typingInterval);
      const errMsg = e instanceof Error ? e.message : String(e);
      await ctx.reply(`❌ Error: ${errMsg}`);
    } finally {
      unsubscribe();
    }
  });

  // --- Document/File messages ---
  bot.on("message:document", async (ctx) => {
    const userId = ctx.from!.id;
    const caption = ctx.message.caption ?? "";
    const doc = ctx.message.document;
    const mimeType = doc.mime_type ?? "";

    // Handle image documents
    if (mimeType.startsWith("image/")) {
      const file = await ctx.api.getFile(doc.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString("base64");

      const { piSessions } = deps;
      await piSessions.getOrCreate(userId);
      await ctx.replyWithChatAction("typing");

      let responseBuffer = "";
      let messageId: number | undefined;

      const unsubscribe = piSessions.subscribe(userId, {
        onTextDelta: (delta) => { responseBuffer += delta; },
        onToolStart: () => {},
        onToolEnd: () => {},
        onAgentEnd: async () => {
          if (responseBuffer.trim()) {
            if (messageId) {
              await ctx.api.editMessageText(ctx.chat!.id, messageId, responseBuffer.slice(0, 4000)).catch(() => {});
            } else {
              await ctx.reply(responseBuffer.slice(0, 4000));
            }
          }
        },
      });

      try {
        const prompt = caption || "Analyze this image.";
        await piSessions.prompt(userId, prompt, [{
          type: "image",
          source: { type: "base64", media_type: mimeType, data: base64 },
        }]);
        if (responseBuffer.trim() && !messageId) {
          await ctx.reply(responseBuffer.slice(0, 4000));
        }
      } catch (e) {
        await ctx.reply(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        unsubscribe();
      }
      return;
    }

    await ctx.reply(`📎 Received file: ${doc.file_name ?? "unknown"}\nFile handling for non-image types coming soon.`);
  });

  return bot;
}
