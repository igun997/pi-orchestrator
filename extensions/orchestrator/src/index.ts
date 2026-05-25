import { REQUIRED_MCPS, findMissingMcps, loadState, saveState, renderMcpSnippet } from "@orchestrator/shared";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseStartArgs } from "./args.js";
import { createRun, listRuns, renderStatus, resetRun, retryTask } from "./runs.js";
import { verifyTasks } from "./verifier.js";
import { advancePipeline, completeTask, failTask } from "./pipeline.js";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export default function orchestratorExtension(pi: ExtensionAPI) {
  pi.registerCommand("orchestrator:start", {
    description: "Start image-to-site orchestration: /orchestrator:start [--auto-heal] [--tui] <ds-img> <page-img>",
    handler: async (args, ctx) => {
      const parsed = parseStartArgs(args ?? "");
      const state = await createRun({ targetDir: ctx.cwd, ...parsed });
      ctx.ui.notify(renderStatus(state), "info");

      // Kick LLM to run extract: pass images, ask for structured JSON, then Q-batch
      pi.sendUserMessage(
        [
          `I've started an orchestrator run. Two images staged:`,
          `- Design system: ${parsed.designSystemImage}`,
          `- Page: ${parsed.pageImage}`,
          ``,
          `Please:`,
          `1. Look at both images`,
          `2. Extract design system tokens (colors in OKLCH, typography, spacing, components) → save to ${ctx.cwd}/.orchestrator/specs/design-system.json`,
          `3. Extract page structure (sections with id, kind, order, content, components) → save to ${ctx.cwd}/.orchestrator/specs/page-spec.json`,
          `4. Ask me gap-filling questions one at a time (product name, target users, tone, anti-references, register brand/product, backend need none/contact-form/auth/cms, domain)`,
          `5. After all questions answered, show a confirmation summary and wait for me to say "confirm"`,
          `6. When I confirm, run /orchestrator:confirm`
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

      state.confirmed = true;
      state.phase = "scaffolding";
      await saveState(ctx.cwd, state);
      ctx.ui.notify("Confirmed. Starting seamless execution — no more prompts needed.", "info");

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
}
