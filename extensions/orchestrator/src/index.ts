import { REQUIRED_MCPS, findMissingMcps, loadState, saveState, renderMcpSnippet } from "@orchestrator/shared";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { parseStartArgs } from "./args.js";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";
import { verifyTasks } from "./verifier.js";
import { advancePipeline, completeTask, failTask } from "./pipeline.js";
import { assembleTaskGraph, loadSectionsFromSpec } from "./assemble-graph.js";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";

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
          `Format: { colors: {hex}, typography: {fontFamilies, scale, weights}, spacing, radii, shadows, borders, components: [{name, variants, states}] }`,
          ``,
          `Step 2: Read page image with read_image tool: ${pageImage}`,
          `Extract as JSON and save to ${specsDir}/page-spec.json using write tool.`,
          `Format: { meta: {inferredPageType}, layout: {grid, breakpoints, container}, sections: [{id (kebab-case), kind, order, content: {headline,...}, components, notes}] }`,
          ``,
          `Step 3: After both specs saved, ask these questions (one at a time). Save each with orchestrator_answer tool:`,
          `- Language for conversation? (key: "language")`,
          `- Static HTML or Astro + shadcn? (key: "framework", value: "astro" or "static")`,
          `- Backend: none / contact-form / auth / cms? (key: "backend-level")`,
          `- Deploy: none / workers.dev / custom domain? (key: "domain", use "none" to skip deploy)`,
          ``,
          `Step 4: After all answers saved, call orchestrator_confirm tool.`,
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

      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
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
      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
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
      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
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

      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
      await advancePipeline(ctx.cwd, driver);

      return {
        content: [{ type: "text", text: `✓ Confirmed. ${state.tasks.length} tasks assembled. Pipeline started.` }],
        details: {}
      };
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
          const driver = {
            sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
            notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
          };
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

      // Detect provider: native multimodal (google, anthropic) vs OpenAI-compatible (9router)
      const model = (ctx as any).model;
      const provider: string = model?.provider ?? "";
      const supportsNativeImage = model?.input?.includes("image") ?? false;

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
      const modelId = process.env.NINEROUTER_MODEL ?? process.env.PI_MODEL ?? "kr/auto";

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
