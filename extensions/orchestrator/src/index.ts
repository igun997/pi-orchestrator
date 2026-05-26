import { REQUIRED_MCPS, findMissingMcps, loadState, saveState, renderMcpSnippet } from "@orchestrator/shared";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { parseStartArgs } from "./args.js";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";
import { verifyTasks } from "./verifier.js";
import { advancePipeline, completeTask, failTask } from "./pipeline.js";
import { assembleTaskGraph, loadSectionsFromSpec } from "./assemble-graph.js";
import { renderProgressWidget, renderProgressStatus } from "./progress.js";
import { hexToOklch, hexBatchToOklch } from "./color.js";
import { mergeSections } from "./merge.js";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";

interface VisionConfig {
  provider?: string | undefined;
  modelId?: string | undefined;
}

/**
 * Load vision config: per-project (.orchestrator/vision.json) > global (~/.pi/orchestrator/vision.json) > undefined
 */
async function loadVisionConfig(cwd: string): Promise<VisionConfig> {
  // Per-project
  const projectPath = join(cwd, ".orchestrator/vision.json");
  if (existsSync(projectPath)) {
    try {
      return JSON.parse(await readFile(projectPath, "utf8"));
    } catch { /* ignore parse errors */ }
  }
  // Global
  const globalPath = join(homedir(), ".pi/orchestrator/vision.json");
  if (existsSync(globalPath)) {
    try {
      return JSON.parse(await readFile(globalPath, "utf8"));
    } catch { /* ignore parse errors */ }
  }
  return {};
}

function createDriver(pi: ExtensionAPI, ctx: any) {
  return {
    sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
    notify: (text: string, level: "info" | "error") => {
      ctx.ui.notify(text, level);
      // Update progress widget
      loadState(ctx.cwd).then((state) => {
        ctx.ui.setStatus("orchestrator", renderProgressStatus(state.phase, state.tasks));
        if (state.tasks.length > 0) {
          ctx.ui.setWidget("orchestrator", renderProgressWidget(state.phase, state.tasks));
        }
      }).catch(() => {});
    }
  };
}

export default function orchestratorExtension(pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      const state = await createRun({ targetDir: ctx.cwd, ...parsed });
      ctx.ui.notify(renderStatus(state), "info");

      const dsImage = parsed.designSystemImage.startsWith("/") ? parsed.designSystemImage : join(ctx.cwd, parsed.designSystemImage);
      const pageImage = parsed.pageImage.startsWith("/") ? parsed.pageImage : join(ctx.cwd, parsed.pageImage);

      const specsDir = join(ctx.cwd, ".orchestrator/specs");
      await mkdir(specsDir, { recursive: true });

      // Update state
      state.phase = "extracting";
      state.specs = {
        designSystem: ".orchestrator/specs/design-system.json",
        page: ".orchestrator/specs/page-spec.json"
      };
      await saveState(ctx.cwd, state);

      // Use native pi multimodal — send images to LLM for extraction
      pi.sendUserMessage(
        [
          `Orchestrator run started. Use the read_image tool to view both images, then extract specs.`,
          ``,
          `Step 1: Read design system image with read_image tool: ${dsImage}`,
          `Extract as JSON and save to ${specsDir}/design-system.json using write tool.`,
          `Format: { colors: {hex}, typography: {fontFamilies, scale, weights}, spacing, radii, shadows, borders, components: [{name, variants, states}], effects: {gradients, overlays, blurs, clipPaths} }`,
          ``,
          `Step 2: Read page image with read_image tool: ${pageImage}`,
          `Extract as JSON and save to ${specsDir}/page-spec.json using write tool.`,
          `Format: { meta: {inferredPageType}, layout: {grid, breakpoints, container}, sections: [{id (kebab-case), kind, order, content: {headline,...}, components, notes, behaviors, effects}] }`,
          ``,
          `IMPORTANT for extraction — look for and document:`,
          `- Navbar: transparent/solid? sticky? changes on scroll? blur backdrop?`,
          `- Hero: gradient overlays? shade? parallax? animated elements?`,
          `- Images: clipped by SVG/shape? masked? rounded custom? overlapping?`,
          `- Sections: background gradients? diagonal cuts? wave separators?`,
          `- Cards: hover effects? elevation changes? border glow?`,
          `- Buttons: gradient fills? shadow on hover? icon animations?`,
          `- Scroll behaviors: fade-in? slide-up? stagger? parallax?`,
          `- Decorative: floating shapes? dots/patterns? blur blobs?`,
          ``,
          `Add these to each section's "behaviors" array and "effects" object in page-spec.json.`,
          ``,
          `Step 3: After both specs saved, ask the user these questions ONE AT A TIME.`,
          `YOU MUST STOP AND WAIT for the user to reply before asking the next question.`,
          `Do NOT answer for the user. Do NOT use defaults unless user explicitly says "go" or "defaults".`,
          `Ask Q1, then STOP. Wait for user reply. Save with orchestrator_answer. Then ask Q2. Repeat.`,
          ``,
          `Questions:`,
          `Q1: Language for conversation? (key: "language")`,
          `Q2: Static HTML or Astro + shadcn? (key: "framework", value: "astro" or "static")`,
          `Q3: Backend: none / contact-form / auth / cms? (key: "backend-level")`,
          `Q4: Deploy: none / workers.dev / custom domain? (key: "domain", use "none" to skip deploy)`,
          ``,
          `START by asking Q1 only. Do not proceed until user answers.`,
          ``,
          `Step 4: After ALL 4 answers saved (user answered each one), call orchestrator_confirm tool.`,
          ``,
          `Tailwind CSS always used. Design/tone/branding from images — follow reference exactly.`,
          `If user says "go" without answering, use defaults (English, static, none, none) and save+confirm.`
        ].join("\n"),
        { deliverAs: "followUp" }
      );
    }
  });

  pi.registerCommand("orchestrator:confirm", {
    description: "Confirm orchestrator plan and start seamless execution (manual trigger)",
    handler: async (_args, ctx) => {
      const state = await loadState(ctx.cwd);
      if (state.confirmed) {
        ctx.ui.notify("Already confirmed. Use /orchestrator:resume to continue.", "info");
        return;
      }

      const sections = await loadSectionsFromSpec(ctx.cwd);
      const framework = (state.answers["framework"] as string)?.includes("static") ? "static" as const : "astro" as const;
      const backend = (state.answers["backend-level"] as string) ?? "none";
      const domain = (state.answers["domain"] as string) ?? "workers.dev";
      state.tasks = assembleTaskGraph({ targetDir: ctx.cwd, framework, backend, domain, sections });
      state.confirmed = true;
      state.phase = "scaffolding";
      await saveState(ctx.cwd, state);
      ctx.ui.notify(`Confirmed. ${state.tasks.length} tasks assembled. Starting seamless execution.`, "info");

      const driver = createDriver(pi, ctx);
      await advancePipeline(ctx.cwd, driver);
    }
  });

  // === Tools (callable by LLM) ===

  pi.registerTool({
    name: "orchestrator_answer",
    label: "Save Answer",
    description: "Save a user answer to orchestrator state. Keys: language, framework, backend-level, domain",
    parameters: Type.Object({
      key: Type.String({ description: "Answer key: language, framework, backend-level, or domain" }),
      value: Type.String({ description: "Answer value" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = await loadState(ctx.cwd);
      state.answers[params.key] = params.value;
      await saveState(ctx.cwd, state);
      return {
        content: [{ type: "text", text: `✓ Saved: ${params.key} = ${params.value}` }],
        details: {}
      };
    }
  });

  pi.registerTool({
    name: "orchestrator_task_done",
    label: "Task Done",
    description: "Mark a pipeline task as complete after executing it",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID to mark complete" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const driver = createDriver(pi, ctx);
      await completeTask(ctx.cwd, params.taskId, driver);
      return {
        content: [{ type: "text", text: `✓ ${params.taskId} complete. Pipeline advancing.` }],
        details: {}
      };
    }
  });

  pi.registerTool({
    name: "orchestrator_task_failed",
    label: "Task Failed",
    description: "Mark a pipeline task as failed",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID that failed" }),
      error: Type.String({ description: "Error message" })
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const driver = createDriver(pi, ctx);
      await failTask(ctx.cwd, params.taskId, params.error, driver);
      return {
        content: [{ type: "text", text: `❌ ${params.taskId} failed: ${params.error}` }],
        details: {}
      };
    }
  });

  pi.registerTool({
    name: "orchestrator_confirm",
    label: "Confirm",
    description: "Confirm orchestrator plan and start seamless execution. Call after all answers are saved.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const state = await loadState(ctx.cwd);
      if (state.confirmed) {
        return { content: [{ type: "text", text: "Already confirmed. Use /orchestrator:resume." }], details: {} };
      }

      const sections = await loadSectionsFromSpec(ctx.cwd);
      const framework = (state.answers["framework"] as string)?.includes("static") ? "static" as const : "astro" as const;
      const backend = (state.answers["backend-level"] as string) ?? "none";
      const domain = (state.answers["domain"] as string) ?? "workers.dev";
      state.tasks = assembleTaskGraph({ targetDir: ctx.cwd, framework, backend, domain, sections });
      state.confirmed = true;
      state.phase = "scaffolding";
      await saveState(ctx.cwd, state);

      const driver = createDriver(pi, ctx);
      await advancePipeline(ctx.cwd, driver);

      return {
        content: [{ type: "text", text: `✓ Confirmed. ${state.tasks.length} tasks assembled. Pipeline started.` }],
        details: {}
      };
    }
  });

  pi.registerTool({
    name: "hex_to_oklch",
    label: "Hex to OKLCH",
    description: "Convert hex color(s) to OKLCH format. Accepts single hex or JSON object of name:hex pairs.",
    parameters: Type.Object({
      colors: Type.Union([
        Type.String({ description: "Single hex color like #FF7A59" }),
        Type.Record(Type.String(), Type.String(), { description: "Object of name:hex pairs like {primary: '#FF7A59', secondary: '#1E63D6'}" })
      ])
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (typeof params.colors === "string") {
        const oklch = hexToOklch(params.colors);
        return { content: [{ type: "text" as const, text: `${params.colors} → ${oklch}` }], details: {} };
      }
      const results = hexBatchToOklch(params.colors as Record<string, string>);
      const lines = Object.entries(results).map(([name, { hex, oklch }]) => `| ${name} | ${hex} | ${oklch} |`);
      const table = `| Token | Hex | OKLCH |\n|---|---|---|\n${lines.join("\n")}`;
      return { content: [{ type: "text" as const, text: table }], details: {} };
    }
  });

  pi.registerTool({
    name: "merge_sections",
    label: "Merge Sections",
    description: "Merge all HTML section files from src/sections/ into src/index.html in page-spec order. Call after all craft tasks complete.",
    parameters: Type.Object({
      projectDir: Type.Optional(Type.String({ description: "Project directory (default: cwd/site)" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectDir = params.projectDir ?? join(ctx.cwd, "site");
      const specsDir = join(ctx.cwd, ".orchestrator/specs");

      try {
        const result = await mergeSections(projectDir, specsDir);
        return {
          content: [{ type: "text" as const, text: `✓ Merged ${result.sections.length} sections into ${result.merged}\nOrder: ${result.sections.join(" → ")}` }],
          details: {}
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], details: {} };
      }
    }
  });

  pi.registerCommand("orchestrator:status", {
    description: "Show orchestrator status",
    handler: async (_args, ctx) => {
      try {
        const state = await loadState(ctx.cwd);
        ctx.ui.notify(renderStatus(state), "info");
      } catch {
        ctx.ui.notify("No orchestrator run found in this directory", "info");
      }
    }
  });

  pi.registerCommand("orchestrator:doctor", {
    description: "Show required MCP bootstrap guidance",
    handler: async (_args, ctx) => {
      const missing = findMissingMcps([], REQUIRED_MCPS);
      const message = [`Required MCPs: ${REQUIRED_MCPS.join(", ")}`, "", renderMcpSnippet(missing)].join("\n");
      ctx.ui.notify(message, "info");
    }
  });

  pi.registerCommand("orchestrator:resume", {
    description: "Resume orchestrator run",
    handler: async (_args, ctx) => {
      try {
        const state = await loadState(ctx.cwd);
        const fileExists = async (path: string) => existsSync(path);
        const verified = await verifyTasks(state.tasks, ctx.cwd, fileExists);

        const invalidated = verified.filter((t, i) => state.tasks[i]?.status === "complete" && t.status === "pending");
        state.tasks = verified;
        await saveState(ctx.cwd, state);

        if (invalidated.length > 0) {
          ctx.ui.notify(`Re-verified: ${invalidated.length} tasks reset to pending`, "info");
        }

        ctx.ui.notify(renderStatus(state), "info");

        // If confirmed, advance pipeline
        if (state.confirmed && state.phase !== "done" && state.phase !== "failed") {
          const driver = createDriver(pi, ctx);
          await advancePipeline(ctx.cwd, driver);
        }
      } catch {
        ctx.ui.notify("No orchestrator run found. Use /orchestrator:start first.", "error");
      }
    }
  });

  pi.registerCommand("orchestrator:list", {
    description: "List orchestrator runs",
    handler: async (_args, ctx) => {
      const runsDir = join(homedir(), ".pi", "orchestrator", "runs");
      const runs = await listRuns(runsDir);
      if (runs.length === 0) {
        ctx.ui.notify("No past runs found.", "info");
      } else {
        const lines = runs.map((r) => `${r.runId.slice(0, 8)} | ${r.phase} | ${r.createdAt}`);
        ctx.ui.notify(lines.join("\n"), "info");
      }
    }
  });

  pi.registerCommand("orchestrator:reset", {
    description: "Reset orchestrator run",
    handler: async (_args, ctx) => {
      const ok = await ctx.ui.confirm("Reset", "Delete .orchestrator/ in this directory?");
      if (!ok) return;
      await resetRun(ctx.cwd);
      ctx.ui.notify("Run reset.", "info");
    }
  });

  pi.registerCommand("orchestrator:retry-task", {
    description: "Retry orchestrator task: /orchestrator:retry-task <task-id>",
    handler: async (args, ctx) => {
      const taskId = args?.trim();
      if (!taskId) {
        ctx.ui.notify("Usage: /orchestrator:retry-task <task-id>", "error");
        return;
      }
      const state = await loadState(ctx.cwd);
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) {
        ctx.ui.notify(`Task not found: ${taskId}`, "error");
        return;
      }
      const updated = retryTask(state, taskId);
      await saveState(ctx.cwd, updated);
      ctx.ui.notify(`Task ${taskId} reset to pending. Run /orchestrator:resume to continue.`, "info");
    }
  });

  pi.registerCommand("orchestrator:vision-config", {
    description: "Configure vision model: /orchestrator:vision-config [--global] [provider/modelId | show | reset]",
    handler: async (args, ctx) => {
      const raw = (args ?? "").trim();
      const isGlobal = raw.includes("--global");
      const arg = raw.replace("--global", "").trim();

      const configDir = isGlobal
        ? join(homedir(), ".pi/orchestrator")
        : join(ctx.cwd, ".orchestrator");
      const configPath = join(configDir, "vision.json");

      // Show current config
      if (!arg || arg === "show") {
        const config = await loadVisionConfig(ctx.cwd);
        if (!config.provider && !config.modelId) {
          ctx.ui.notify("Vision: auto-detect (using current model)", "info");
        } else {
          ctx.ui.notify(`Vision: ${config.provider ?? "auto"}/${config.modelId ?? "auto"}\nSource: ${existsSync(join(ctx.cwd, ".orchestrator/vision.json")) ? "project" : existsSync(join(homedir(), ".pi/orchestrator/vision.json")) ? "global" : "none"}`, "info");
        }
        return;
      }

      // Reset
      if (arg === "reset") {
        if (existsSync(configPath)) {
          const { unlink } = await import("node:fs/promises");
          await unlink(configPath);
          ctx.ui.notify(`Vision config removed: ${configPath}`, "info");
        } else {
          ctx.ui.notify("No vision config to reset.", "info");
        }
        return;
      }

      // Set: provider/modelId
      const parts = arg.split("/");
      let config: VisionConfig;
      if (parts.length >= 2) {
        config = { provider: parts[0], modelId: parts.slice(1).join("/") };
      } else {
        config = { modelId: arg };
      }

      await mkdir(configDir, { recursive: true });
      await writeFile(configPath, JSON.stringify(config, null, 2));
      ctx.ui.notify(`Vision config saved ${isGlobal ? "(global)" : "(project)"}:\n${JSON.stringify(config, null, 2)}`, "info");
    }
  });

  // === Image reading tool (auto-detects provider for vision) ===

  pi.registerTool({
    name: "read_image",
    label: "Read Image",
    description: "Read and analyze a local image file. Returns visual content or description depending on model capabilities.",
    parameters: Type.Object({
      path: Type.String({ description: "Absolute or relative path to the image file" }),
      prompt: Type.Optional(Type.String({ description: "What to extract or focus on (default: describe everything)" }))
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const resolved = params.path.startsWith("/") ? params.path : join(ctx.cwd, params.path);
      if (!existsSync(resolved)) {
        return { content: [{ type: "text" as const, text: `Error: File not found: ${resolved}` }], details: {} };
      }

      const ext = extname(resolved).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"
      };
      const mime = mimeMap[ext];
      if (!mime) {
        return { content: [{ type: "text" as const, text: `Error: Unsupported image format: ${ext}` }], details: {} };
      }

      const buf = await readFile(resolved);
      const base64 = buf.toString("base64");

      // Vision config: per-project > global > auto-detect from ctx.model
      const visionConfig = await loadVisionConfig(ctx.cwd);
      const provider: string = visionConfig.provider ?? (ctx as any).model?.provider ?? "";
      const modelId: string = visionConfig.modelId ?? (ctx as any).model?.id ?? "kr/auto";
      const supportsNativeImage = (ctx as any).model?.input?.includes("image") ?? false;

      // Native providers (google, anthropic, etc) — return image content directly
      const nativeProviders = ["google", "google-vertex", "anthropic", "amazon-bedrock"];
      if (nativeProviders.includes(provider) && supportsNativeImage) {
        return {
          content: [
            { type: "image" as const, data: base64, mimeType: mime },
            { type: "text" as const, text: `Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)` }
          ],
          details: {}
        };
      }

      // OpenAI-compatible / 9router — use vision API endpoint
      const baseUrl = process.env.NINEROUTER_URL ?? "http://localhost:20128";
      const apiKey = process.env.NINEROUTER_KEY ?? process.env.NINEROUTER_API_KEY ?? "";

      if (!apiKey) {
        // No 9router key and non-native provider — return image anyway, hope for the best
        return {
          content: [
            { type: "image" as const, data: base64, mimeType: mime },
            { type: "text" as const, text: `Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)` }
          ],
          details: {}
        };
      }

      const dataUri = `data:${mime};base64,${base64}`;
      const userPrompt = params.prompt ?? "Describe this image in exhaustive detail. Include all visible text, colors, layout, components, and structure.";

      try {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelId,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                { type: "image_url", image_url: { url: dataUri } }
              ]
            }],
            stream: false
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text" as const, text: `Vision API error ${res.status}: ${errText}` }], details: {} };
        }

        const json = await res.json() as { choices: { message: { content: string } }[] };
        const description = json.choices?.[0]?.message?.content ?? "No response";

        return {
          content: [{ type: "text" as const, text: `[Image: ${resolved} (${mime}, ${Math.round(buf.length / 1024)}KB)]\n\n${description}` }],
          details: {}
        };
      } catch (e: any) {
        return { content: [{ type: "text" as const, text: `Vision error: ${e.message}` }], details: {} };
      }
    }
  });
}
