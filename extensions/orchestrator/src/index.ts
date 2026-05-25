import { REQUIRED_MCPS, findMissingMcps, loadState, saveState, renderMcpSnippet } from "@orchestrator/shared";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseStartArgs } from "./args.js";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";
import { verifyTasks } from "./verifier.js";
import { advancePipeline, completeTask, failTask } from "./pipeline.js";
import { assembleTaskGraph, loadSectionsFromSpec } from "./assemble-graph.js";
import { callVision, loadVisionConfig } from "./vision-client.js";
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export default function orchestratorExtension(pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      const state = await createRun({ targetDir: ctx.cwd, ...parsed });
      ctx.ui.notify(renderStatus(state), "info");

      // === Vision extraction via 9router ===
      let config;
      try {
        config = loadVisionConfig();
      } catch (e: any) {
        ctx.ui.notify(`Vision config error: ${e.message}. Set NINEROUTER_URL + NINEROUTER_API_KEY.`, "error");
        return;
      }

      const dsImage = parsed.designSystemImage.startsWith("/") ? parsed.designSystemImage : join(ctx.cwd, parsed.designSystemImage);
      const pageImage = parsed.pageImage.startsWith("/") ? parsed.pageImage : join(ctx.cwd, parsed.pageImage);

      const specsDir = join(ctx.cwd, ".orchestrator/specs");
      await mkdir(specsDir, { recursive: true });

      ctx.ui.notify("Extracting design system from image...", "info");
      try {
        const dsResult = await callVision(config, [dsImage], [
          "Extract the design system from this image as JSON.",
          "Include: colors (hex), typography (fontFamilies, scale with size/line-height, weights),",
          "spacing (unit + scale), radii, shadows, borders, components (name, variants, states).",
          "Output ONLY valid JSON, no markdown fences."
        ].join(" "));

        let dsJson: string;
        try {
          const parsed = JSON.parse(dsResult.content.replace(/^```json?\n?|```$/g, "").trim());
          dsJson = JSON.stringify(parsed, null, 2);
        } catch {
          dsJson = dsResult.content;
        }
        await writeFile(join(specsDir, "design-system.json"), dsJson);
        ctx.ui.notify(`✓ Design system extracted (${dsResult.usage?.completionTokens ?? "?"} tokens)`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Design system extraction failed: ${e.message}`, "error");
        return;
      }

      ctx.ui.notify("Extracting page structure from image...", "info");
      try {
        const pageResult = await callVision(config, [pageImage], [
          "Extract the page structure from this image as JSON.",
          "Format: { meta: { inferredPageType }, layout: { grid, breakpoints, container },",
          "sections: [{ id (kebab-case), kind, order (0-indexed), content: { headline, ... },",
          "components: [...], notes: [...] }] }.",
          "Output ONLY valid JSON, no markdown fences."
        ].join(" "));

        let pageJson: string;
        try {
          const parsed = JSON.parse(pageResult.content.replace(/^```json?\n?|```$/g, "").trim());
          pageJson = JSON.stringify(parsed, null, 2);
        } catch {
          pageJson = pageResult.content;
        }
        await writeFile(join(specsDir, "page-spec.json"), pageJson);
        ctx.ui.notify(`✓ Page spec extracted (${pageResult.usage?.completionTokens ?? "?"} tokens)`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Page extraction failed: ${e.message}`, "error");
        return;
      }

      // Update state
      state.phase = "questioning";
      state.specs = {
        designSystem: ".orchestrator/specs/design-system.json",
        page: ".orchestrator/specs/page-spec.json"
      };
      await saveState(ctx.cwd, state);

      // Kick LLM — minimal questions, then auto-confirm
      pi.sendUserMessage(
        [
          `Vision extraction complete. Specs saved to .orchestrator/specs/.`,
          `Design system, colors, typography, tone, and branding already extracted from images — follow the reference exactly.`,
          `Tailwind CSS is always used for styling.`,
          ``,
          `IMPORTANT: The commands below are pi extension commands (slash commands), NOT bash/shell commands.`,
          `Call them as pi commands in the chat, not in a terminal.`,
          ``,
          `Only 4 questions needed. Ask one at a time, save each answer:`,
          `1. What language do you want me to use for this conversation? (English/Indonesian/etc)`,
          `   → then call pi command: /orchestrator:answer language <value>`,
          `2. Static HTML or framework (Astro + shadcn)?`,
          `   → then call pi command: /orchestrator:answer framework <value>`,
          `3. Backend need — none / contact-form / auth / cms?`,
          `   → then call pi command: /orchestrator:answer backend-level <value>`,
          `4. Deploy to workers.dev or custom domain?`,
          `   → then call pi command: /orchestrator:answer domain <value>`,
          ``,
          `After ALL answers saved, immediately call pi command: /orchestrator:confirm`,
          `Do NOT run these in bash/shell. They are pi slash commands.`,
          `If user just says "go" without answering, use defaults (English, astro, none, workers.dev) and save+confirm.`
        ].join("\n"),
        { deliverAs: "followUp" }
      );
    }
  });

  pi.registerCommand("orchestrator:confirm", {
    description: "Confirm orchestrator plan and start seamless execution",
    handler: async (_args, ctx) => {
      const state = await loadState(ctx.cwd);
      if (state.confirmed) {
        ctx.ui.notify("Already confirmed. Use /orchestrator:resume to continue.", "info");
        return;
      }

      // Assemble full task graph from answers + specs
      const sections = await loadSectionsFromSpec(ctx.cwd);
      const framework = (state.answers["framework"] as string)?.includes("static") ? "static" as const : "astro" as const;
      const backend = (state.answers["backend-level"] as string) ?? "none";
      const domain = (state.answers["domain"] as string) ?? "workers.dev";
      state.tasks = assembleTaskGraph({ targetDir: ctx.cwd, framework, backend, domain, sections });
      state.confirmed = true;
      state.phase = "scaffolding";
      await saveState(ctx.cwd, state);
      ctx.ui.notify(`Confirmed. ${state.tasks.length} tasks assembled. Starting seamless execution.`, "info");

      // Advance pipeline — sends task prompts to LLM
      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
      await advancePipeline(ctx.cwd, driver);
    }
  });

  pi.registerCommand("orchestrator:task-done", {
    description: "Mark a pipeline task complete (called by LLM after executing task)",
    handler: async (args, ctx) => {
      const taskId = args?.trim();
      if (!taskId) {
        ctx.ui.notify("Usage: /orchestrator:task-done <task-id>", "error");
        return;
      }
      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
      await completeTask(ctx.cwd, taskId, driver);
    }
  });

  pi.registerCommand("orchestrator:answer", {
    description: "Save user answer: /orchestrator:answer <key> <value>",
    handler: async (args, ctx) => {
      const match = (args ?? "").trim().match(/^(\S+)\s+(.+)$/);
      if (!match) {
        ctx.ui.notify("Usage: /orchestrator:answer <key> <value>\nKeys: language, framework, backend-level, domain", "error");
        return;
      }
      const [, key, value] = match;
      const state = await loadState(ctx.cwd);
      state.answers[key!] = value!;
      await saveState(ctx.cwd, state);
      ctx.ui.notify(`✓ Saved: ${key} = ${value}`, "info");
    }
  });

  pi.registerCommand("orchestrator:task-failed", {
    description: "Mark a pipeline task failed (called by LLM on error)",
    handler: async (args, ctx) => {
      const parts = args?.trim().split(/\s+(.+)/) ?? [];
      const taskId = parts[0];
      const error = parts[1] ?? "unknown error";
      if (!taskId) {
        ctx.ui.notify("Usage: /orchestrator:task-failed <task-id> <error>", "error");
        return;
      }
      const driver = {
        sendMessage: (text: string) => pi.sendUserMessage(text, { deliverAs: "followUp" }),
        notify: (text: string, level: "info" | "error") => ctx.ui.notify(text, level)
      };
      await failTask(ctx.cwd, taskId, error, driver);
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

  // === Vision via 9router ===

  pi.registerCommand("orchestrator:vision", {
    description: "Extract specs from images via 9router vision: /orchestrator:vision <image1> [image2]",
    handler: async (args, ctx) => {
      const images = (args ?? "").trim().split(/\s+/).filter(Boolean);
      if (images.length === 0) {
        ctx.ui.notify("Usage: /orchestrator:vision <image1> [image2]", "error");
        return;
      }

      let config;
      try {
        config = loadVisionConfig();
      } catch (e: any) {
        ctx.ui.notify(`Vision config error: ${e.message}`, "error");
        return;
      }

      const resolvedImages = images.map((img) => img.startsWith("/") ? img : join(ctx.cwd, img));
      ctx.ui.notify(`Analyzing ${resolvedImages.length} image(s) via 9router...`, "info");

      try {
        // Extract design system
        const dsResult = await callVision(config, resolvedImages.slice(0, 1), [
          "Extract the design system from this image as JSON.",
          "Include: colors (hex), typography (fontFamilies, scale with size/line-height, weights),",
          "spacing (unit + scale), radii, shadows, borders, components (name, variants, states).",
          "Output ONLY valid JSON, no markdown fences."
        ].join(" "));

        const specsDir = join(ctx.cwd, ".orchestrator/specs");
        await mkdir(specsDir, { recursive: true });

        // Try parse JSON, fallback to raw
        let dsJson: string;
        try {
          const parsed = JSON.parse(dsResult.content.replace(/^```json?\n?|```$/g, "").trim());
          dsJson = JSON.stringify(parsed, null, 2);
        } catch {
          dsJson = dsResult.content;
        }
        await writeFile(join(specsDir, "design-system.json"), dsJson);
        ctx.ui.notify(`✓ Design system extracted (${dsResult.usage?.completionTokens ?? "?"} tokens)`, "info");

        // Extract page spec if second image provided
        if (resolvedImages.length > 1) {
          const pageResult = await callVision(config, resolvedImages.slice(1, 2), [
            "Extract the page structure from this image as JSON.",
            "Format: { meta: { inferredPageType }, layout: { grid, breakpoints, container },",
            "sections: [{ id (kebab-case), kind, order (0-indexed), content: { headline, ... },",
            "components: [...], notes: [...] }] }.",
            "Output ONLY valid JSON, no markdown fences."
          ].join(" "));

          let pageJson: string;
          try {
            const parsed = JSON.parse(pageResult.content.replace(/^```json?\n?|```$/g, "").trim());
            pageJson = JSON.stringify(parsed, null, 2);
          } catch {
            pageJson = pageResult.content;
          }
          await writeFile(join(specsDir, "page-spec.json"), pageJson);
          ctx.ui.notify(`✓ Page spec extracted (${pageResult.usage?.completionTokens ?? "?"} tokens)`, "info");
        }

        ctx.ui.notify("Vision extraction complete. Specs saved to .orchestrator/specs/", "info");
      } catch (e: any) {
        ctx.ui.notify(`Vision error: ${e.message}`, "error");
      }
    }
  });

  pi.registerCommand("orchestrator:vision-describe", {
    description: "Describe an image via 9router vision: /orchestrator:vision-describe <image> [prompt]",
    handler: async (args, ctx) => {
      const parts = (args ?? "").trim().split(/\s+/);
      const imagePath = parts[0];
      const prompt = parts.slice(1).join(" ") || "Describe this image in detail.";

      if (!imagePath) {
        ctx.ui.notify("Usage: /orchestrator:vision-describe <image> [prompt]", "error");
        return;
      }

      let config;
      try {
        config = loadVisionConfig();
      } catch (e: any) {
        ctx.ui.notify(`Vision config error: ${e.message}`, "error");
        return;
      }

      const resolved = imagePath.startsWith("/") ? imagePath : join(ctx.cwd, imagePath);
      ctx.ui.notify(`Analyzing image via 9router...`, "info");

      try {
        const result = await callVision(config, [resolved], prompt);
        // Send result as message so LLM can use it
        pi.sendUserMessage(`[Vision result for ${imagePath}]\n\n${result.content}`, { deliverAs: "followUp" });
      } catch (e: any) {
        ctx.ui.notify(`Vision error: ${e.message}`, "error");
      }
    }
  });
}
