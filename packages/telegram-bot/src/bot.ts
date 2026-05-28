import { Bot, InlineKeyboard, type Context } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";

import type { BotConfig } from "./config.js";
import { AllowlistManager } from "./allowlist.js";
import { CredentialStore } from "./credentials/store.js";
import { verifyProvider, verifyCloudflare } from "./credentials/verify.js";
import { WorkspaceManager } from "./session/workspace.js";
import { buildPersona } from "./persona.js";

export interface BotDependencies {
  config: BotConfig;
  allowlist: AllowlistManager;
  credentials: CredentialStore;
}

export function createBot(deps: BotDependencies): Bot {
  const { config, allowlist, credentials } = deps;
  const bot = new Bot(config.telegramBotToken);
  const persona = buildPersona(config);

  // Auto-retry on rate limits
  bot.api.config.use(autoRetry());

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

    const lines = [
      `📊 <b>Status</b>`,
      "",
      `📂 Workspace: ${active ? `<b>${active.name}</b>` : "<i>none</i>"}`,
      `🤖 Model: <code>${modelConfig.default || "not set"}</code>`,
      `🎭 Persona: ${persona.name}`,
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
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

    await ctx.reply(`🚀 Deploying <b>${active.name}</b> to Cloudflare Workers...`, { parse_mode: "HTML" });
    // TODO: integrate with pi session to run deploy skill
    await ctx.reply("⚠️ Deploy integration pending — will use MCP or wrangler CLI.");
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
      switch (action) {
        case "new":
          await ctx.reply("Tell me what you want to build, or use /workspace to select a workspace first.");
          break;
        case "workspace":
          await ctx.reply("Use /workspace to manage workspaces.");
          break;
        case "status":
          await ctx.reply("Use /status to see current state.");
          break;
        case "model":
          await ctx.reply("Use /model to switch models.");
          break;
        case "deploy":
          await ctx.reply("Use /deploy to deploy current project.");
          break;
        case "sessions":
          await ctx.reply("Use /sessions to manage sessions.");
          break;
        case "setup":
          await ctx.reply("Use /setup to configure providers.");
          break;
        case "users":
          const users = allowlist.getUsers();
          await ctx.reply(users.length > 0 ? `👥 Allowed users:\n${users.map((u) => `• <code>${u}</code>`).join("\n")}` : "No users added yet.", { parse_mode: "HTML" });
          break;
      }
      return;
    }

    await ctx.answerCallbackQuery();
  });

  // --- Natural language (fallback) ---
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;

    // TODO: route to pi session with orchestrator skills
    await ctx.reply(`💬 Received: "${text}"\n\n⚠️ Pi session integration pending.`);
  });

  return bot;
}
